const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path');
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611120001_online.sql'), 'utf8');
  await db.exec(migration);
  async function rpc(name, args, types) {
    const params = args.map((v, i) => types[i] === 'jsonb' ? JSON.stringify(v) : v);
    const q = `select public.${name}(${types.map((t, i) => '$'+(i+1)+'::'+t).join(',')}) as result`;
    return (await db.query(q, params)).rows[0]?.result;
  }
  const store = {
    getRun: (user,id) => rpc('endless_get_run',[user,id],['uuid','uuid']),
    start: run => rpc('endless_start_run',[run],['jsonb']),
    receipt: (id,seq) => rpc('endless_receipt',[id,seq],['uuid','int']),
    batch: ({run,seq,fingerprint,inputs,state}) => rpc('endless_commit_batch',[run.id,run.user_id,seq,fingerprint,inputs,state],['uuid','uuid','int','text','jsonb','jsonb']),
    finish: run => rpc('endless_finish_run',[run.id,run.user_id,run.seq],['uuid','uuid','int']),
    leaderboard: (day,version,user) => rpc('endless_leaderboard',[day,version,user],['date','text','uuid'])
  };
  return { db, rpc, store, migration };
}
module.exports = { database };
