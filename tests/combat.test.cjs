const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require(process.env.THREE_PATH || 'three');
const source = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
function view(count = 1111) {
  return { cx: 0, cz: 0, radius: 1.2, tall: count >= 1000 ? 4 : 1, hops: 0,
    group: new THREE.Group(), celebrate() { this.hops++; },
    resetFight() { this.front = null; }, setValue(n) { this.value = n; }, eachUnit() {} };
}
function setup() {
  const sounds = [], flung = [], context = {
    THREE, scene: new THREE.Scene(), calm: false,
    Sfx: { brawl: (...args) => sounds.push(args), win() {}, lose() {} },
    Fx: { fling: (...args) => flung.push(args) },
    performance: { now: () => 0 }, Math, console
  };
  vm.createContext(context); vm.runInContext(source('combat.js') + '\nthis.Combat = Combat;', context);
  return { context, combat: context.Combat, sounds, flung, camera: new THREE.PerspectiveCamera() };
}

test('combat beats throttle bursts, reuse bounded pools and clear on restart', () => {
  const { context, combat, sounds, flung, camera } = setup(), player = view(), rival = view(); rival.cz = -4;
  const meshes = context.scene.getObjectByName('Combat effects').children, seen = meshes.map(() => 0);
  const geometry = meshes.map(m => m.geometry), material = meshes.map(m => m.material);
  combat.begin(player, rival);
  for (let i = 0; i < 180; i++) {
    combat.damage(player, rival, 500);
    combat.update(1 / 60, camera);
    meshes.forEach((m, k) => {
      assert.equal(m.geometry, geometry[k]); assert.equal(m.material, material[k]);
      assert(m.count <= m.instanceMatrix.count); seen[k] = Math.max(seen[k], m.count);
      assert(m.instanceMatrix.array.every(Number.isFinite));
      assert(m.geometry.attributes.effectOpacity.array.every(a => Number.isFinite(a) && a >= 0 && a <= 1));
    });
  }
  assert(sounds.length >= 12 && sounds.length <= 16, 'damage ticks must not spawn a burst every frame');
  assert(seen.every(n => n > 0), 'snow, stars, chips and flashes all appear');
  assert(flung.length >= 24 && flung.length <= 96 && flung.length % 2 === 0, 'both sides lose bodies, a few per beat');
  assert(flung.every(([kind, x, z, back]) => (kind === 'penguin') === (back > 0) && Math.abs(z + 2) < .5), 'bodies come from the line');
  combat.reset(); combat.update(.05, camera);
  assert(meshes.every(m => m.count === 0));
  assert.equal(context.scene.children.length, 1, 'effect resources must not accumulate');
});

test('the line is the middle of the gap, and collisions burst exactly there', () => {
  const { context, combat, sounds, camera } = setup(), player = view(), rival = view();
  player.cx = 1; player.cz = 5; player.radius = 2; rival.cx = -1; rival.cz = -1; rival.radius = 1;
  assert.deepEqual({ ...combat.line(player, rival) }, { x: 0, z: 1.5 });
  const out = {}; assert.equal(combat.line(player, rival, out), out);
  const flashes = context.scene.getObjectByName('Combat impact flashes'), m = new THREE.Matrix4(), p = new THREE.Vector3();
  combat.contact(3, -7, 1.75); combat.contact(9, 9, 1); combat.update(.001, camera);
  assert.equal(flashes.count, 1, 'collisions in the same instant share one burst');
  flashes.getMatrixAt(0, m); p.setFromMatrixPosition(m);
  assert(Math.abs(p.x - 3) < 1e-6 && Math.abs(p.z + 7) < 1e-6);
  assert.equal(sounds.length, 1);
  for (let i = 0; i < 400; i++) { combat.contact(i % 5, 0, 4.6); combat.update(1 / 60, camera); }
  for (const mesh of context.scene.getObjectByName('Combat effects').children) assert(mesh.count <= mesh.instanceMatrix.count);
});

test('large impacts give a bounded nudge; reduced motion suppresses shake, hop and slow motion', () => {
  const { context, combat, camera } = setup(), player = view(), rival = view();
  combat.begin(player, rival); let maximum = 0;
  for (let i = 0; i < 20; i++) {
    combat.update(.01, camera); camera.position.set(0, 0, 0); combat.shakeCamera(camera);
    maximum = Math.max(maximum, camera.position.length());
  }
  assert(maximum > .005 && maximum < .085); assert.equal(camera.position.length(), 0);
  context.calm = true; combat.begin(player, rival); combat.finish(player, rival, true);
  camera.position.set(0, 0, 0); combat.shakeCamera(camera);
  assert.equal(camera.position.length(), 0); assert.equal(player.hops, 0); assert.equal(combat.timeScale(.01), 1);
  context.calm = false; combat.finish(player, rival, true); assert.equal(player.hops, 1);
  let slowed = 0; for (let i = 0; i < 100; i++) if (combat.timeScale(.01) < 1) slowed++;
  assert(slowed >= 20 && slowed <= 40, 'the last blow of a boss fight slows briefly, then time runs normally');
  combat.finish(player, rival, true); combat.reset(); assert.equal(combat.timeScale(.01), 1);
});

test('battle effects preserve one-for-one losses and do not celebrate a tie or defeat', () => {
  for (const [ours, theirs] of [[1500, 500], [13, 7], [4, 9], [1, 1], [3, 400]]) for (const dt of [1 / 30, 1 / 60]) {
    const { context: c, combat, camera } = setup();
    Object.assign(c, {
      CrowdView: function () { return view(); }, W: 5, SPEED: 14,
      Save: { data: { level: 1, coins: 0, upStart: 0, upIncome: 0, stars: {}, best: {} }, store() {} },
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)), starsFor: () => 3,
      gates: [], hazards: [], foes: [], level: { bossZ: -10 }
    });
    vm.runInContext(source('game.js') + '\nthis.G=G;this.step=step;this.player=player;this.resetRun=resetRun;', c);
    const rival = view(theirs); rival.cz = 0;
    const foe = { view: rival, size: theirs, isBoss: true, dead: false }; c.foes.push(foe);
    Object.assign(c.G, { state: 'running', count: ours, x: 0, z: 6 }); c.player.setValue(ours);
    let frames = 0, fought = 0;
    for (; frames < 240 && c.G.state === 'running'; frames++) {
      c.step(dt); combat.update(dt, camera);
      if (c.G.fight) { fought += dt; assert(c.G.z >= rival.cz + 2.4 + 1.3 - 1e-9, 'the crowds must not run into each other'); }
    }
    assert.equal(c.G.count, Math.max(0, ours - theirs));
    assert.equal(foe.size, Math.max(0, theirs - ours));
    assert.equal(c.G.state, ours > theirs ? 'win' : 'lose');
    assert.equal(c.player.hops, ours > theirs ? 1 : 0);
    assert(fought > .45 && fought < 3.2, `a fight should last long enough to see, but not drag: ${fought}`);
    assert.equal(c.player.front, ours > theirs ? null : c.G.line);
    c.resetRun(); assert(contextMeshes(c).every(m => m.count === 0)); assert.equal(c.player.front, null);
  }
});
function contextMeshes(context) { return context.scene.getObjectByName('Combat effects').children; }

test('brawl sound honours mute and throttles ordinary contacts', () => {
  let now = 0; const calls = [], context = { Save: { data: { muted: false } }, performance: { now: () => now }, setTimeout };
  vm.createContext(context); vm.runInContext(source('audio.js') + '\nthis.Sfx=Sfx;', context);
  const audio = context.Sfx; audio.ctx = {}; audio.tone = (...args) => calls.push(args);
  audio.brawl(false, false); assert.equal(calls.length, 2);
  now = 20; audio.brawl(false, false); assert.equal(calls.length, 2);
  now = 220; audio.brawl(false, false); assert.equal(calls.length, 4);
  assert.notEqual(calls[0][0], calls[2][0], 'successive impacts should vary in pitch');
  context.Save.data.muted = true; audio.brawl(true, true); assert.equal(calls.length, 4);
  context.Save.data.muted = false; audio.brawl(true, true); assert.equal(calls.length, 7);
  audio.ctx = null; audio.brawl(true, true); assert.equal(calls.length, 7);
});
