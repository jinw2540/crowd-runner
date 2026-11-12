const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const C = require('../shared/endless.js');
function steer(s) {
  const e = C.chunk(s.seed,s.chunkIndex).events[s.eventIndex];
  if (!e) return 0;
  if (e.kind === 'gate') return C.applyOp(s.count,e.left) > C.applyOp(s.count,e.right) ? -4000 : 4000;
  if (e.kind === 'hazard') return [-4400,0,4400].sort((a,b) => C.hazardLoss(s.count,a,e,s.tick)-C.hazardLoss(s.count,b,e,s.tick))[0];
  return 0;
}
test('daily courses are reproducible, versioned and bounded at distant chunk indices', () => {
  assert.equal(C.dayAt(Date.parse('2026-11-11T14:59:59Z')), '2026-11-11');
  assert.equal(C.dayAt(Date.parse('2026-11-11T15:00:00Z')), '2026-11-12');
  for (const index of [0,1,4,100,100000]) {
    const a=C.chunk(42,index); assert.deepEqual(a,C.chunk(42,index));
    assert(a.events.length<=4); assert(a.events.every(e=>e.at>a.start && e.at<a.end));
    assert.equal(a.events.filter(e=>e.boss).length,(index+1)%5===0?1:0);
  }
  assert.notDeepEqual(C.chunk(42,1),C.chunk(43,1));
  assert.throws(()=>C.create(1,'unknown'));
});
test('30, 60 and 120 Hz rendering produce identical fixed-tick results', () => {
  const results=[];
  for(const hz of [30,60,120]) {
    const s=C.create(22),clock=C.clock();
    for(let i=0;i<hz*90&&!s.finished;i++) assert(clock.advance(1/hz,()=>{C.step(s,steer(s));return !s.finished}));
    results.push(s);
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
  assert(results[0].bosses>0); assert(results[0].distance>720000);
});
test('browser script and server replay agree without cosmetic randomness', () => {
  const sandbox={Math:Object.create(Math)};sandbox.Math.random=()=>{throw Error('unseeded randomness')};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../shared/endless.js'),'utf8'),sandbox);
  const s=sandbox.EndlessCore.create(8), inputs=[];
  for(let i=0;i<6000&&!s.finished;i++){const x=steer(s);inputs.push(x);sandbox.EndlessCore.step(s,x)}
  let server=C.create(8);for(let i=0;i<inputs.length;i+=300)server=C.replay(server,inputs.slice(i,i+300));
  assert.deepEqual(JSON.parse(JSON.stringify(s)),server);
  assert.equal(C.score(server),server.score);
});
test('scoring awards each boss and clean segment once and death freezes the run', () => {
  let s=C.create(1);s.distance=5*C.RULES.chunk-1;s.chunkIndex=4;s.eventIndex=C.chunk(1,4).events.length;s.damaged=false;s.bosses=1;
  C.step(s,0);assert.equal(s.clean,1);assert.equal(s.chunkIndex,5);
  const n=s.clean;C.step(s,0);assert.equal(s.clean,n);
  assert.equal(C.score({distance:1250000,bosses:1,clean:3}),13600);
  const c=C.chunk(1,4),e=c.events.find(e=>e.boss);s=C.create(1);s.chunkIndex=4;s.eventIndex=c.events.indexOf(e);s.distance=e.at-1;s.count=e.size;
  while(!s.finished)C.step(s,0);assert.equal(s.count,0);assert.equal(s.bosses,0);
  const before={...s};C.step(s,0);assert.deepEqual(s,before);
});
test('rules bound population, lateral speed, replay requests and serialized state', () => {
  assert.equal(C.applyOp(8000,{op:'×',v:2}),9999);assert.equal(C.applyOp(1,{op:'−',v:100}),1);
  const s=C.create(9);C.step(s,4400);assert.equal(s.x,150);
  assert.throws(()=>C.replay(s,[NaN]));assert.throws(()=>C.replay(s,[4401]));assert.throws(()=>C.replay(s,Array(301).fill(0)));
  for(let i=0;i<60*60*30;i++){if(s.finished){s.finished=false;s.fight=null;s.count=9999}s.count=Math.max(8000,s.count);C.step(s,steer(s))}
  assert(s.distance>20000000);assert(JSON.stringify(s).length<2048);
  const clock=C.clock();assert.equal(clock.advance(3,()=>{}),false);assert.equal(clock.alpha,0);
});
