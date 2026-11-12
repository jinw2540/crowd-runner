const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const C = global.EndlessCore = require('../shared/endless.js');
const OnlineRun = require('../js/online-run.js');
const { database } = require('./helpers/database.cjs');
const hash = async text => createHash('sha256').update(text).digest('hex');
test('SQL migration, permissions, replay, retries and daily best records work together', async t => {
  const { db, store, rpc, migration }=await database();t.after(()=>db.close());
  await db.exec(migration); // Reapplying the integrated migration is safe.
  const a=randomUUID(),b=randomUUID();
  for(const [id,name] of [[a,'펭귄하나'],[b,'펭귄둘']]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.profiles(id,nickname) values($1,$2)',[id,name])}
  const {createRunService}=await import('../shared/run-service.mjs');let time=Date.now();
  const service=createRunService({store,now:()=>time,digest:hash});
  const request={requestId:randomUUID()},run=await service.start(a,request);
  assert.equal((await service.start(a,request)).id,run.id);
  await assert.rejects(service.status(b,run.id),e=>e.status===404);
  await assert.rejects(service.inputs(a,run.id,{seq:1,fromTick:0,inputs:[0]}),e=>e.code==='out_of_order');
  await assert.rejects(service.inputs(a,run.id,{seq:0,fromTick:0,inputs:Array(300).fill(0)}),e=>e.code==='too_fast');
  time+=6000;const batch={seq:0,fromTick:0,inputs:Array(300).fill(0),score:999999999};
  const first=await service.inputs(a,run.id,batch),again=await service.inputs(a,run.id,batch);
  assert.equal(first.tick,300);assert.equal(again.tick,300);assert(again.duplicate);assert(first.score<999999999);
  await assert.rejects(service.inputs(a,run.id,{...batch,inputs:Array(300).fill(100)}),e=>e.code==='duplicate_mismatch');
  await assert.rejects(service.finish(a,run.id,{seq:1,tick:301,reason:'quit'}),e=>e.code==='unverified_inputs');
  const final=await service.finish(a,run.id,{seq:1,tick:300,reason:'quit'});
  assert.equal(final.status,'finished');assert.equal((await service.finish(a,run.id,{seq:1,tick:300,reason:'quit'})).score,final.score);
  assert.equal((await db.query('select count(*)::int as n from public.endless_daily_bests')).rows[0].n,1);
  const r2=await service.start(a,{requestId:randomUUID()});time+=1000;await service.inputs(a,r2.id,{seq:0,fromTick:0,inputs:[0]});await service.finish(a,r2.id,{seq:1,tick:1,reason:'quit'});
  const rb=await service.start(b,{requestId:randomUUID()});time+=6000;await service.inputs(b,rb.id,batch);await service.finish(b,rb.id,{seq:1,tick:300,reason:'quit'});
  const board=await service.leaderboard(a,run.day);assert.equal(board.rows.length,2);assert.equal(board.me.score,final.score);assert.equal(board.me.rank,1);assert.equal(board.best.score,final.score);
  assert(board.rows.every(r=>!('user_id' in r)));assert.equal((await service.leaderboard(null,run.day)).me,null);
  await assert.rejects(service.leaderboard(null,'2026-02-31'),e=>e.code==='invalid_day');
  const expired=await service.start(a,{requestId:randomUUID()});time+=C.RULES.idleMs+1;
  await assert.rejects(service.inputs(a,expired.id,{seq:0,fromTick:0,inputs:[0]}),e=>e.code==='run_expired');
  await db.exec("set role authenticated");
  await assert.rejects(db.query('select * from public.endless_runs'),/permission denied/);
  await assert.rejects(rpc('endless_start_run',[{}],['jsonb']),/permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  const data={level:3,coins:50,upStart:1,upIncome:0,stars:{1:3,2:2},best:{1:10,2:12}};
  assert((await rpc('save_progress',[data,true],['jsonb','boolean'])).ok);
  for(const bad of [{...data,stars:{1:null}},{...data,stars:{1:'hi'}},{...data,stars:{999999999999999999:2}},{...data,upStart:31},{...data,coins:-5}])assert.equal((await rpc('save_progress',[bad,false],['jsonb','boolean'])).ok,false);
  assert.equal((await rpc('save_progress',[{...data,level:999},false],['jsonb','boolean'])).ok,false);
  await db.exec('set role authenticated');
  const own=await db.query('select * from public.progress');assert.equal(own.rows.length,1);
  await assert.rejects(db.query('update public.progress set coins=999'),/permission denied/);
  await db.exec('reset role');
  await db.exec("update public.endless_runs set created_at=now()-interval '31 days',updated_at=now()-interval '31 days'");
  const pruned=await rpc('endless_prune_history',[],[]);assert(pruned.input_batches>0);assert(pruned.runs>0);
  assert.equal((await db.query('select count(*)::int as n from public.endless_daily_bests')).rows[0].n,2);
  assert.equal((await service.leaderboard(a,run.day)).best.score,final.score);
});
test('uploader retains an unacknowledged batch and retries without duplicate ticks', async () => {
  const payloads=[];let fail=true;const r=new OnlineRun({id:'test',day:'2026-11-12',version:C.RULES.version},'u',async(p,b)=>{
    payloads.push(JSON.parse(JSON.stringify(b)));if(fail){fail=false;throw new Error('lost response')}
    if(p.endsWith('finish'))return{score:200,status:'finished'};return{tick:b.fromTick+b.inputs.length,seq:b.seq+1};
  });
  r.pending=Array(300).fill(0);await assert.rejects(r.flush());assert.equal(r.pending.length,300);
  await r.flush();assert.deepEqual(payloads[0],payloads[1]);assert.equal(r.pending.length,0);
  for(let i=0;i<40;i++)r.record(50);await r.finish('quit');assert.equal(r.acknowledged,340);assert.equal(r.seq,2);assert(r.result);
});
test('uploader stops ranked submission after ownership or input validation errors', async () => {
  const r=new OnlineRun({id:'x'},'u',async()=>{throw Object.assign(new Error('forbidden'),{status:403})});
  r.pending=[0];await assert.rejects(r.flush(true));assert.equal(r.valid,false);assert.equal(r.pending.length,0);
});
test('a permanently rejected finish becomes practice, while transient failures can retry',async()=>{
  let status=503;const r=new OnlineRun({id:'x'},'u',async()=>{throw Object.assign(new Error('failure'),{status})});
  await assert.rejects(r.finish('quit'));assert(r.valid);
  status=410;await assert.rejects(r.finish('quit'));assert(!r.valid);assert.equal(r.result,null);
});
