const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = global.THREE = require(process.env.THREE_PATH || 'three');
require('../js/environment/ice-models.js');
require('../js/environment.js');
const E = global.IceEnvironment;
function random(seed) { return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed) + 0x6d2b79f5 | 0; return (seed >>> 0) / 4294967296; }; }
function meshes(root) { const a = []; root.traverse(o => { if (o.isMesh) a.push(o); }); return a; }

test('continuous road keeps the full playable lane level, from start through finish', () => {
  for (const length of [210, 234, 426]) {
    const root = E.road(12.6, length); root.position.z = -length / 2 + 20; root.updateMatrixWorld(true);
    const ray = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0));
    // Dense samples detect transverse gaps, capped-tile dips and raised snow in the lane.
    for (let z = 0; z >= 60 - length; z -= 3) for (const x of [-5, -4.4, -2.5, 0, 2.5, 4.4, 5]) {
      ray.ray.origin.set(x, 2, z);
      const hits = ray.intersectObject(root, true);
      assert(hits.length, `missing road at ${x}, ${z}`);
      assert(Math.abs(hits[0].point.y) <= .004, `uneven lane at ${x}, ${z}: ${hits[0].point.y}`);
    }
    assert.equal(meshes(root).length, 2);
    for (const m of meshes(root)) {
      assert(m.geometry.attributes.position.array.every(Number.isFinite));
      assert(m.geometry.attributes.normal.array.every(Number.isFinite));
      assert(!E.isShared(m.geometry));
      assert(E.isShared(m.material));
      m.geometry.dispose();
    }
  }
  assert.equal(T.ColorManagement.legacyMode, true);
});

test('all approved floes retain their silhouettes and reuse geometry across restarts', () => {
  for (const variant of ['small', 'snowy', 'large', 'spiky', 'spectator', 'finish']) {
    const a = E.floe(variant), b = E.floe(variant), parts = meshes(a);
    assert.equal(parts.length, 2);
    parts.forEach((m, i) => {
      assert.equal(m.geometry, meshes(b)[i].geometry);
      assert(E.isShared(m.geometry)); assert(E.isShared(m.material));
      assert(m.geometry.attributes.position.array.every(Number.isFinite));
      const normals = m.geometry.attributes.normal;
      for (let n = 0; n < normals.count; n++) assert(new T.Vector3().fromBufferAttribute(normals, n).length() > .99);
    });
    if (variant === 'spiky') {
      const bounds = new T.Box3().setFromObject(a);
      assert(bounds.max.y > 3, 'fractured peaks must remain full height');
      assert.equal(parts.reduce((n, m) => n + m.geometry.index.count / 3, 0), 542, 'only the source frost ribbon uses fewer segments at low detail');
    }
  }
  assert.equal(T.ColorManagement.legacyMode, true);
});

test('drifting floes stay outside the road and spectator islands, with bounded motion', () => {
  const reserved = [{ x: 11.3, z: -30, radius: 2.7 }, { x: -11.3, z: -75, radius: 2.7 }];
  const field = E.driftField({ length: 426, halfWidth: 5, seaY: -1.4, random: random(19), reserved });
  assert.deepEqual([...new Set(field.placements.map(e => e.variant))].sort(), ['large', 'small', 'snowy', 'spiky']);
  for (const e of field.placements) {
    assert(Math.abs(e.x) - e.radius >= 7.7 - 1e-5, 'scenery must leave a water margin outside the road');
    for (const s of reserved) assert(Math.hypot(e.x - s.x, e.z - s.z) > e.radius + s.radius);
  }
  const matrix = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), scale = new T.Vector3();
  for (const z of [0, -150, -375]) for (const t of [0, 1.7, 3.4, 6.8]) {
    field.update(t, z);
    assert(field.batches.some(b => b.group.visible));
    assert(field.batches.some(b => !b.group.visible), 'distant chunks should be culled');
    for (const batch of field.batches) if (batch.group.visible) for (let i = 0; i < batch.entries.length; i++) {
      batch.meshes[0].getMatrixAt(i, matrix); matrix.decompose(p, q, scale);
      const e = batch.entries[i]; assert(Math.abs(p.y - e.y) <= .02501);
      assert(Math.abs(p.x - e.x) < .00001); assert(Math.abs(p.z - e.z) < .0001);
      const other = new T.Matrix4(); batch.meshes[1].getMatrixAt(i, other); assert(other.equals(matrix));
    }
  }
  field.update(1, -150, true);
  const before = field.batches.filter(b => b.group.visible).map(b => Array.from(b.meshes[0].instanceMatrix.array));
  field.update(4, -150, true);
  assert.deepEqual(field.batches.filter(b => b.group.visible).map(b => Array.from(b.meshes[0].instanceMatrix.array)), before);
});

// Match the game's seeded source without relying on Math.random or wall-clock time.
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function scatterFixture(seed) {
  const length = 210 + seed % 10 * 24;
  const reserved = [{ x: 12.5, z: -45, radius: E.radius('spectator') + .1 }, { x: -17, z: -105, radius: E.radius('spectator') + .1 }, { x: 0, z: 50 - length, radius: E.radius('finish') + .1 }];
  return { length, halfWidth: 5, seaY: -1.4, random: seeded(seed * 6197 + 73), reserved };
}
function releaseField(field) { field.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }

test('scenery repeats for the same stage and changes for a different seed', () => {
  const first = E.driftField(scatterFixture(7)), repeat = E.driftField(scatterFixture(7)), different = E.driftField(scatterFixture(8));
  assert.deepEqual(first.placements, repeat.placements);
  assert.deepEqual(first.clearings, repeat.clearings);
  assert.notDeepEqual(first.placements, different.placements);
  [first, repeat, different].forEach(releaseField);
});

test('random clusters retain clear water, size variety and safe separation across 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const options = scatterFixture(seed), field = E.driftField(options), floes = field.placements;
    const small = floes.filter(e => e.size === 'small'), medium = floes.filter(e => e.size === 'medium'), large = floes.filter(e => e.size === 'large');
    assert(small.length > medium.length && medium.length > large.length && large.length >= 2);
    assert(floes.length < 80, 'keep the scene sparse and within the existing rendering budget');
    assert(large.some(e => e.variant === 'spiky'));
    assert(field.clearings.some(g => g.side === -1) && field.clearings.some(g => g.side === 1));
    const clusters = new Map();
    for (let i = 0; i < floes.length; i++) {
      const e = floes[i];
      if (e.cluster >= 0) clusters.set(e.cluster, (clusters.get(e.cluster) || 0) + 1);
      assert(Math.abs(e.x) - e.radius >= 7.7 - 1e-9);
      assert(e.z - e.radius >= 20 - options.length && e.z + e.radius <= 18);
      if (e.size === 'large') assert(Math.abs(e.x) - e.radius >= 21 - 1e-9, 'large peaks belong offshore');
      for (const other of [...floes.slice(i + 1), ...options.reserved]) {
        assert(Math.hypot(e.x - other.x, e.z - other.z) >= e.radius + other.radius + .9 - 1e-9, `overlap in seed ${seed}`);
      }
      for (const g of field.clearings) if (Math.sign(e.x) === g.side && Math.abs(e.x) - e.radius < g.edge) {
        assert(Math.abs(e.z - g.z) >= e.radius + g.halfLength, 'open-water pockets must remain clear');
      }
    }
    for (const size of clusters.values()) assert(size >= 2 && size <= 4);
    assert(clusters.size >= 4);
    releaseField(field);
  }
});
