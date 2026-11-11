-- 뭉쳐 달려: 로그인·랭킹용 Supabase 스키마. SQL Editor에서 한 번 실행한다.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  created_at timestamptz not null default now()
);

create table public.progress (
  user_id uuid primary key references auth.users on delete cascade,
  level int not null default 1,
  coins int not null default 0,
  up_start int not null default 0,
  up_income int not null default 0,
  stars jsonb not null default '{}',
  best jsonb not null default '{}',
  total_stars int not null default 0,
  merges int not null default 0,          -- merge=true 로 받아들인 횟수
  updated_at timestamptz not null default now()
);

create table public.flagged (
  id bigint generated always as identity primary key,
  user_id uuid,
  reason text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.flagged enable row level security;

create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "progress read own" on public.progress for select using (auth.uid() = user_id);
-- progress 에는 insert/update 정책이 없다. 쓰기는 save_progress 만 가능하다.
-- flagged 에는 정책이 없다. 대시보드에서만 본다.

-- 랭킹: 뷰는 소유자 권한으로 실행되므로 progress 의 RLS 를 거치지 않고, 닉네임·스테이지·별만 공개된다.
create view public.leaderboard as
  select row_number() over (order by p.level desc, p.total_stars desc, p.updated_at asc)::int as rank,
         f.nickname, p.level, p.total_stars
  from public.progress p join public.profiles f on f.id = p.user_id
  order by rank
  limit 100;
grant select on public.leaderboard to anon, authenticated;

-- 내 순위 (100위 밖이어도 알 수 있게)
create function public.my_rank()
returns table (rank int, level int, total_stars int)
language sql security definer set search_path = public as $$
  select r.rank, r.level, r.total_stars from (
    select p.user_id, p.level, p.total_stars,
           row_number() over (order by p.level desc, p.total_stars desc, p.updated_at asc)::int as rank
    from progress p join profiles f on f.id = p.user_id
  ) r where r.user_id = auth.uid();
$$;
revoke all on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;

-- 기본 검증이 들어간 저장 함수. 클라이언트는 이 함수로만 progress 를 바꾼다.
-- 위반하면 예외 대신 {ok:false, reason} 을 돌려준다(예외를 던지면 flagged 기록도 롤백되기 때문).
create function public.save_progress(p_data jsonb, p_merge boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  old progress%rowtype;
  have boolean;
  v_level int; v_coins bigint; v_start int; v_income int;
  v_stars jsonb := coalesce(p_data->'stars', '{}');
  v_best jsonb := coalesce(p_data->'best', '{}');
  k text; v numeric;
  total int := 0;
  allow_merge boolean;
  reason text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not signed in'); end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(v_stars) <> 'object' or jsonb_typeof(v_best) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad payload');
  end if;

  select * into old from progress where user_id = uid;
  have := found;

  begin
    v_level := (p_data->>'level')::int;
    v_coins := (p_data->>'coins')::bigint;
    v_start := (p_data->>'upStart')::int;
    v_income := (p_data->>'upIncome')::int;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad payload');
  end;

  -- 합치기 예외는 계정당 처음 몇 번(기기 몇 대)까지만 인정한다.
  allow_merge := p_merge and (not have or old.merges < 5);

  if v_level is null or v_level < 1 then reason := 'level';
  elsif have and v_level < old.level then reason := 'level decreased';
  elsif have and not allow_merge and v_level > old.level + 1 then reason := 'level jump';
  elsif not have and not allow_merge and v_level > 2 then reason := 'level jump';
  elsif v_start is null or v_start < 0 or v_start > 30 then reason := 'up_start';
  elsif v_income is null or v_income < 0 then reason := 'up_income';
  elsif v_coins is null or v_coins < 0 or v_coins > 3::bigint * v_level * v_level + 200::bigint * v_level + 500 then reason := 'coins';
  end if;

  if reason is null then
    for k, v in select key, (value #>> '{}')::numeric from jsonb_each(v_stars) loop
      if k !~ '^[0-9]+$' or k::int < 1 or k::int >= v_level or v < 0 or v > 3 or v <> trunc(v) then reason := 'stars'; exit; end if;
      total := total + v::int;
    end loop;
  end if;
  if reason is null then
    for k, v in select key, (value #>> '{}')::numeric from jsonb_each(v_best) loop
      if k !~ '^[0-9]+$' or k::int < 1 or k::int >= v_level or v < 0 then reason := 'best'; exit; end if;
    end loop;
  end if;

  if reason is not null then
    insert into flagged (user_id, reason, payload) values (uid, reason, p_data);
    return jsonb_build_object('ok', false, 'reason', reason);
  end if;

  insert into progress as t (user_id, level, coins, up_start, up_income, stars, best, total_stars, merges, updated_at)
  values (uid, v_level, v_coins, v_start, v_income, v_stars, v_best, total, case when p_merge then 1 else 0 end, now())
  on conflict (user_id) do update set
    level = excluded.level, coins = excluded.coins, up_start = excluded.up_start, up_income = excluded.up_income,
    stars = excluded.stars, best = excluded.best, total_stars = excluded.total_stars,
    merges = t.merges + case when p_merge then 1 else 0 end, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.save_progress(jsonb, boolean) from public, anon;
grant execute on function public.save_progress(jsonb, boolean) to authenticated;
