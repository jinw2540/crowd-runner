const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require(process.env.THREE_PATH || 'three');
const source = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
function view(count = 1111) {
  return { cx: 0, cz: 0, radius: 1.2, tall: count >= 1000 ? 4 : 1, impacts: 0, hops: 0,
    group: new THREE.Group(), impact() { this.impacts++; }, celebrateImpact() { this.hops++; },
    resetImpact() {}, setValue(n) { this.value = n; }, eachUnit() {} };
}
function setup() {
  const sounds = [], context = {
    THREE, scene: new THREE.Scene(), calm: false,
    Sfx: { brawl: (...args) => sounds.push(args), win() {}, lose() {} },
    performance: { now: () => 0 }, Math, console
  };
  vm.createContext(context); vm.runInContext(source('combat.js') + '\nthis.Combat = Combat;', context);
  return { context, combat: context.Combat, sounds, camera: new THREE.PerspectiveCamera() };
}

test('combat beats throttle bursts, reuse bounded pools and clear on restart', () => {
  const { context, combat, sounds, camera } = setup(), player = view(), rival = view(); rival.cz = -2;
  const meshes = context.scene.getObjectByName('Combat effects').children;
  const geometry = meshes.map(m => m.geometry), material = meshes.map(m => m.material);
  combat.begin(player, rival);
  for (let i = 0; i < 180; i++) {
    combat.damage(player, rival, 500);
    combat.update(1 / 60, camera);
    meshes.forEach((m, k) => {
      assert.equal(m.geometry, geometry[k]); assert.equal(m.material, material[k]);
      assert(m.count <= m.instanceMatrix.count);
      assert(m.instanceMatrix.array.every(Number.isFinite));
      assert(m.geometry.attributes.effectOpacity.array.every(a => Number.isFinite(a) && a >= 0 && a <= 1));
    });
  }
  assert(sounds.length >= 12 && sounds.length <= 16, 'damage ticks must not spawn a burst every frame');
  assert(meshes.every(m => m.count > 0));
  combat.reset(); combat.update(.05, camera);
  assert(meshes.every(m => m.count === 0));
  assert.equal(context.scene.children.length, 1, 'effect resources must not accumulate');
});

test('large impacts give a bounded nudge; reduced motion suppresses recoil and shake', () => {
  const { context, combat, camera } = setup(), player = view(), rival = view();
  combat.begin(player, rival); let maximum = 0;
  for (let i = 0; i < 20; i++) {
    combat.update(.01, camera); camera.position.set(0, 0, 0); combat.shakeCamera(camera);
    maximum = Math.max(maximum, camera.position.length());
  }
  assert(maximum > .005 && maximum < .085); assert.equal(camera.position.length(), 0);
  const before = player.impacts;
  context.calm = true; combat.begin(player, rival); combat.finish(player, rival);
  camera.position.set(0, 0, 0); combat.shakeCamera(camera);
  assert.equal(camera.position.length(), 0); assert.equal(player.impacts, before); assert.equal(player.hops, 0);
  context.calm = false; combat.finish(player, rival); assert.equal(player.hops, 1);
});

test('battle effects preserve one-for-one losses and do not celebrate a tie or defeat', () => {
  for (const [ours, theirs] of [[1500, 500], [13, 7], [4, 9], [1, 1]]) for (const dt of [1 / 30, 1 / 60]) {
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
    Object.assign(c.G, { state: 'running', count: ours, x: 0, z: 1 }); c.player.setValue(ours);
    for (let frame = 0; frame < 240 && c.G.state === 'running'; frame++) { c.step(dt); combat.update(dt, camera); }
    assert.equal(c.G.count, Math.max(0, ours - theirs));
    assert.equal(foe.size, Math.max(0, theirs - ours));
    assert.equal(c.G.state, ours > theirs ? 'win' : 'lose');
    assert.equal(c.player.hops, ours > theirs ? 1 : 0);
    c.resetRun(); assert(contextMeshes(c).every(m => m.count === 0));
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
