-- Integrates PR #1's Google accounts, cloud progress and stage ranking.
-- Endless records are isolated: only the server's replay verifier may write them.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  created_at timestamptz not null default now()
);
create table if not exists public.progress (
  user_id uuid primary key references auth.users on delete cascade,
  level int not null default 1, coins int not null default 0,
  up_start int not null default 0, up_income int not null default 0,
  stars jsonb not null default '{}', best jsonb not null default '{}',
  total_stars int not null default 0, merges int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.flagged (
  id bigint generated always as identity primary key,
  user_id uuid, reason text, payload jsonb, created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.flagged enable row level security;
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "progress read own" on public.progress;
create policy "profiles readable" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "progress read own" on public.progress for select to authenticated using (user_id = auth.uid());
revoke all on public.profiles, public.progress, public.flagged from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.progress to authenticated;

create or replace view public.leaderboard as
  select row_number() over (order by p.level desc, p.total_stars desc, p.updated_at, p.user_id)::int as rank,
    f.nickname, p.level, p.total_stars
  from public.progress p join public.profiles f on f.id = p.user_id
  order by rank limit 100;
grant select on public.leaderboard to anon, authenticated;
create or replace function public.my_rank()
returns table (rank int, level int, total_stars int)
language sql security definer set search_path = '' as $$
  select r.rank, r.level, r.total_stars from (
    select p.user_id, p.level, p.total_stars,
      row_number() over (order by p.level desc, p.total_stars desc, p.updated_at, p.user_id)::int as rank
    from public.progress p join public.profiles f on f.id = p.user_id
  ) r where r.user_id = auth.uid();
$$;
revoke all on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;

create or replace function public.save_progress(p_data jsonb, p_merge boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); old public.progress%rowtype; have boolean; merging boolean;
  lv int; coins bigint; start_n int; income_n int; total int; k text; value jsonb;
  stars jsonb := '{}'; best jsonb := '{}'; field text; reason text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not signed in'); end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'bad payload'); end if;
  foreach field in array array['level','coins','upStart','upIncome'] loop
    if jsonb_typeof(p_data->field) is distinct from 'number' or (p_data->>field) !~ '^[0-9]{1,10}$' then
      return jsonb_build_object('ok', false, 'reason', 'bad payload'); end if;
  end loop;
  lv := least((p_data->>'level')::bigint, 2147483647); coins := (p_data->>'coins')::bigint;
  start_n := least((p_data->>'upStart')::bigint, 2147483647); income_n := least((p_data->>'upIncome')::bigint, 2147483647);
  if lv < 1 or lv > 100000 then reason := 'level';
  elsif start_n > 30 then reason := 'up_start';
  elsif income_n > 1000 then reason := 'up_income';
  elsif coins > least(2147483647::bigint, 3::bigint * lv * lv + 200::bigint * lv + 500) then reason := 'coins'; end if;
  foreach field in array array['stars','best'] loop
    if jsonb_typeof(p_data->field) is distinct from 'object' then reason := 'bad payload'; exit; end if;
    for k, value in select * from jsonb_each(p_data->field) loop
      if k !~ '^[1-9][0-9]{0,5}$' or jsonb_typeof(value) is distinct from 'number' or value::text !~ '^[0-9]{1,10}$' then reason := field; exit; end if;
      if k::int >= lv or value::bigint > (case when field = 'stars' then 3 else 2147483647 end) then reason := field; exit; end if;
    end loop;
    if reason is not null then exit; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into old from public.progress where user_id = uid for update; have := found;
  merging := coalesce(p_merge, false) and (not have or old.merges < 5);
  if reason is null and not merging and lv > (case when have then old.level + 1 else 2 end) then reason := 'level jump'; end if;
  if reason is not null then
    insert into public.flagged(user_id, reason) values(uid, reason);
    return jsonb_build_object('ok', false, 'reason', reason);
  end if;
  stars := case when have then old.stars else '{}'::jsonb end;
  best := case when have then old.best else '{}'::jsonb end;
  for k, value in select * from jsonb_each(p_data->'stars') loop stars := jsonb_set(stars, array[k], to_jsonb(greatest(coalesce((stars->>k)::int,0), value::int))); end loop;
  for k, value in select * from jsonb_each(p_data->'best') loop best := jsonb_set(best, array[k], to_jsonb(greatest(coalesce((best->>k)::bigint,0), value::bigint))); end loop;
  select coalesce(sum(v::int),0) into total from jsonb_each(stars) as t(k,v);
  insert into public.progress as p(user_id,level,coins,up_start,up_income,stars,best,total_stars,merges)
  values(uid, greatest(lv,coalesce(old.level,1)), case when merging then greatest(coins,coalesce(old.coins,0)) else coins end,
    greatest(start_n,coalesce(old.up_start,0)), greatest(income_n,coalesce(old.up_income,0)), stars,best,total,
    coalesce(old.merges,0) + case when merging then 1 else 0 end)
  on conflict(user_id) do update set level=excluded.level, coins=excluded.coins, up_start=excluded.up_start,
    up_income=excluded.up_income,stars=excluded.stars,best=excluded.best,total_stars=excluded.total_stars,merges=excluded.merges,updated_at=now();
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.save_progress(jsonb,boolean) from public, anon;
grant execute on function public.save_progress(jsonb,boolean) to authenticated;

create table if not exists public.endless_runs (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  request_id uuid not null, day date not null, version text not null, seed bigint not null,
  state jsonb not null, seq int not null default 0,
  status text not null default 'active' check(status in ('active','finished','abandoned')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique(user_id, request_id)
);
create index if not exists endless_runs_user_time on public.endless_runs(user_id,created_at desc);
create table if not exists public.endless_input_batches (
  run_id uuid references public.endless_runs on delete cascade, seq int not null,
  fingerprint text not null, inputs jsonb not null, created_at timestamptz not null default now(), primary key(run_id,seq)
);
create table if not exists public.endless_daily_bests (
  day date not null, version text not null, user_id uuid references auth.users on delete cascade,
  run_id uuid not null references public.endless_runs, score bigint not null, distance bigint not null,
  completed_at timestamptz not null, primary key(day,version,user_id)
);
create index if not exists endless_scores_order on public.endless_daily_bests(day,version,score desc,distance desc,completed_at,run_id);
alter table public.endless_runs enable row level security;
alter table public.endless_input_batches enable row level security;
alter table public.endless_daily_bests enable row level security;
revoke all on public.endless_runs,public.endless_input_batches,public.endless_daily_bests from anon,authenticated;
grant all on public.endless_runs,public.endless_input_batches,public.endless_daily_bests to service_role;

create or replace function public.endless_start_run(p_run jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (p_run->>'user_id')::uuid; r public.endless_runs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into r from public.endless_runs where user_id=uid and request_id=(p_run->>'request_id')::uuid;
  if found then return to_jsonb(r); end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'profile_required'; end if;
  if (select count(*) from public.endless_runs where user_id=uid and created_at > now()-interval '1 minute') >= 6 then raise exception 'rate_limited'; end if;
  update public.endless_runs set status='abandoned' where user_id=uid and status='active';
  insert into public.endless_runs(id,user_id,request_id,day,version,seed,state)
  values((p_run->>'id')::uuid,uid,(p_run->>'request_id')::uuid,(p_run->>'day')::date,p_run->>'version',(p_run->>'seed')::bigint,p_run->'state') returning * into r;
  return to_jsonb(r);
end $$;
create or replace function public.endless_get_run(p_user uuid,p_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select to_jsonb(r) from public.endless_runs r where r.id=p_id and r.user_id=p_user;
$$;
create or replace function public.endless_receipt(p_id uuid,p_seq int)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('fingerprint',b.fingerprint) from public.endless_input_batches b where b.run_id=p_id and b.seq=p_seq;
$$;
create or replace function public.endless_commit_batch(p_id uuid,p_user uuid,p_seq int,p_hash text,p_inputs jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.endless_runs%rowtype;
begin
  select * into r from public.endless_runs where id=p_id and user_id=p_user for update;
  if not found or r.seq<>p_seq or r.status<>'active' or r.updated_at < now()-interval '10 minutes' then return null; end if;
  if (p_state->>'tick')::bigint <> (r.state->>'tick')::bigint + jsonb_array_length(p_inputs) then return null; end if;
  insert into public.endless_input_batches(run_id,seq,fingerprint,inputs) values(p_id,p_seq,p_hash,p_inputs);
  update public.endless_runs set state=p_state,seq=seq+1,updated_at=now() where id=p_id returning * into r;
  return to_jsonb(r);
end $$;
create or replace function public.endless_finish_run(p_id uuid,p_user uuid,p_seq int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.endless_runs%rowtype;
begin
  select * into r from public.endless_runs where id=p_id and user_id=p_user for update;
  if not found or r.seq<>p_seq or r.status='abandoned' then raise exception 'run_closed'; end if;
  if r.status='finished' then return to_jsonb(r); end if;
  if r.updated_at < now()-interval '10 minutes' then raise exception 'run_expired'; end if;
  update public.endless_runs set status='finished',completed_at=now(),updated_at=now() where id=p_id returning * into r;
  insert into public.endless_daily_bests as b(day,version,user_id,run_id,score,distance,completed_at)
  values(r.day,r.version,r.user_id,r.id,(r.state->>'score')::bigint,(r.state->>'distance')::bigint,r.completed_at)
  on conflict(day,version,user_id) do update set run_id=excluded.run_id,score=excluded.score,distance=excluded.distance,completed_at=excluded.completed_at
  where (excluded.score,excluded.distance) > (b.score,b.distance);
  return to_jsonb(r);
end $$;
create or replace function public.endless_leaderboard(p_day date,p_version text,p_user uuid)
returns jsonb language sql security definer set search_path = '' as $$
  with ranked as (
    select row_number() over(order by b.score desc,b.distance desc,b.completed_at,b.run_id) as rank,
      b.user_id, f.nickname,b.score,b.distance,b.user_id=p_user as me
    from public.endless_daily_bests b join public.profiles f on f.id=b.user_id where b.day=p_day and b.version=p_version
  ), mine as (select rank from ranked where user_id=p_user)
  select jsonb_build_object('day',p_day,'version',p_version,
    'best',(select jsonb_build_object('score',b.score,'distance',b.distance,'day',b.day) from public.endless_daily_bests b
      where b.user_id=p_user and b.version=p_version order by b.score desc,b.distance desc,b.completed_at,b.run_id limit 1),
    'rows',coalesce((select jsonb_agg(to_jsonb(r)-'user_id' order by rank) from ranked r where rank<=100),'[]'::jsonb),
    'around',coalesce((select jsonb_agg(to_jsonb(r)-'user_id' order by rank) from ranked r where abs(rank-(select rank from mine))<=2),'[]'::jsonb),
    'me',(select to_jsonb(r)-'user_id' from ranked r where user_id=p_user),
    'gap',(select greatest(0,a.score-b.score+1) from ranked a join ranked b on a.rank=b.rank-1 where b.user_id=p_user));
$$;

-- These RPCs receive a user ID only from the Auth-verified server function.
revoke all on function public.endless_start_run(jsonb),public.endless_get_run(uuid,uuid),public.endless_receipt(uuid,int),
  public.endless_commit_batch(uuid,uuid,int,text,jsonb,jsonb),public.endless_finish_run(uuid,uuid,int),public.endless_leaderboard(date,text,uuid) from public,anon,authenticated;
grant execute on function public.endless_start_run(jsonb),public.endless_get_run(uuid,uuid),public.endless_receipt(uuid,int),
  public.endless_commit_batch(uuid,uuid,int,text,jsonb,jsonb),public.endless_finish_run(uuid,uuid,int),public.endless_leaderboard(date,text,uuid) to service_role;

-- Operator-scheduled maintenance. Keep daily bests and their final verified states.
-- Never run from the browser; schedule once a day after reviewing the retention policy.
create or replace function public.endless_prune_history()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare batches int; runs int; abandoned int;
begin
  update public.endless_runs set status='abandoned' where status='active' and updated_at < now()-interval '10 minutes';
  get diagnostics abandoned = row_count;
  delete from public.endless_input_batches b using public.endless_runs r
    where b.run_id=r.id and r.status<>'active' and r.updated_at < now()-interval '30 days';
  get diagnostics batches = row_count;
  delete from public.endless_runs r where r.status<>'active' and r.updated_at < now()-interval '30 days'
    and not exists(select 1 from public.endless_daily_bests b where b.run_id=r.id);
  get diagnostics runs = row_count;
  return jsonb_build_object('abandoned',abandoned,'input_batches',batches,'runs',runs);
end $$;
revoke all on function public.endless_prune_history() from public,anon,authenticated;
grant execute on function public.endless_prune_history() to service_role;
