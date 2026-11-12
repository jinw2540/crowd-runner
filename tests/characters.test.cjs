// npm install && npm test; THREE_PATH may point to an existing r149 build offline.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const T = global.THREE = require(process.env.THREE_PATH || 'three');
// Texture painting is irrelevant to geometric tests; the game uses real canvas contexts.
global.document = { createElement() { return { getContext() { return new Proxy({
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
}, { get(o, k) { return o[k] || (() => {}); } }); } }; } };
require('../js/characters/penguin-soft.js');
require('../js/characters/penguin-tiers.js');
require('../js/characters/crab-model.js');
require('../js/characters.js');

function pose(asset, vertex, frame) {
  const g = asset.geometry, data = asset.texture.image.data, width = asset.texture.image.width;
  const p = new T.Vector3().fromBufferAttribute(g.attributes.position, vertex), result = new T.Vector3();
  for (let k = 0; k < 2; k++) {
    const joint = g.attributes.characterJoint.array[vertex * 2 + k], w = g.attributes.characterWeight.array[vertex * 2 + k];
    const at = (frame * width + joint * 3) * 4;
    result.x += w * (data[at] * p.x + data[at + 1] * p.y + data[at + 2] * p.z + data[at + 3]);
    result.y += w * (data[at + 4] * p.x + data[at + 5] * p.y + data[at + 6] * p.z + data[at + 7]);
    result.z += w * (data[at + 8] * p.x + data[at + 9] * p.y + data[at + 10] * p.z + data[at + 11]);
  }
  return result;
}

for (const kind of ['penguin', 'crab']) for (let tier = 0; tier < 4; tier++) {
  test(`${kind} tier ${tier}: crowd poses match the approved animated source`, () => {
    const asset = CharacterModels.get(kind, tier), g = asset.geometry;
    assert.equal(T.ColorManagement.legacyMode, true, 'colour mode must not leak into scenery');
    assert(asset.triangles < 11000); assert(asset.texture.image.data.every(Number.isFinite));
    assert(asset.height < 1.1, 'growth must be applied only by CrowdView');
    const source = (kind === 'penguin' ? createCrowdPenguin : createCrowdCrab)(T, { tier, growthScale: false, detail: 'low' });
    source.mixer.stopAllAction(); source.root.updateMatrixWorld(true);
    const normalize = new T.Matrix4().makeRotationY(kind === 'penguin' ? Math.PI : 0).scale(new T.Vector3().setScalar(kind === 'penguin' ? 0.4 : 0.26));
    const meshes = []; source.root.traverse(o => { if (o.isMesh) meshes.push(o); });
    let firstJoint = 0; const samples = [];
    for (const mesh of meshes) {
      const end = firstJoint + (mesh.isSkinnedMesh ? mesh.skeleton.bones.length : 1), p = mesh.geometry.attributes.position;
      const lookup = new Map(), key = v => v.toArray().map(x => Math.round(x * 1e5)).join(',');
      for (let i = 0; i < p.count; i++) {
        const v = new T.Vector3().fromBufferAttribute(p, i);
        if (mesh.isSkinnedMesh) v.applyMatrix4(mesh.bindMatrix);
        lookup.set(key(v), i);
      }
      for (let v = 0; v < g.attributes.position.count; v += 19) {
        const joint = g.attributes.characterJoint.getX(v);
        if (joint < firstJoint || joint >= end) continue;
        const actual = new T.Vector3().fromBufferAttribute(g.attributes.position, v);
        let i = lookup.get(key(actual));
        if (i === undefined) {
          // Float32 storage can straddle a rounded lookup cell at a bind transform.
          let nearest = Infinity;
          for (let j = 0; j < p.count; j++) {
            const candidate = new T.Vector3().fromBufferAttribute(p, j);
            if (mesh.isSkinnedMesh) candidate.applyMatrix4(mesh.bindMatrix);
            const distance = candidate.distanceTo(actual);
            if (distance < nearest) { nearest = distance; i = j; }
          }
          assert(nearest < 0.000001, mesh.name + ' must sample the original surface: ' + nearest);
        }
        samples.push({ mesh, i, v });
      }
      firstJoint = end;
    }
    assert(samples.length > 100);
    let maxError = 0, maxInterpolationError = 0;
    source.clips.forEach((clip, c) => {
      source.mixer.stopAllAction(); source.mixer.clipAction(clip).reset().play();
      for (const f of [0, 5, 13, 23, 31]) for (const fraction of [0, 0.5]) {
        source.mixer.setTime(clip.duration * (f + fraction) / 32); source.root.updateMatrixWorld(true);
        for (const { mesh, i, v } of samples) {
          const expected = new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
          if (mesh.isSkinnedMesh) mesh.boneTransform(i, expected);
          expected.applyMatrix4(mesh.matrixWorld).applyMatrix4(normalize);
          const actual = pose(asset, v, c * 32 + f);
          if (fraction) actual.lerp(pose(asset, v, c * 32 + (f + 1) % 32), fraction);
          const error = actual.distanceTo(expected);
          if (fraction) maxInterpolationError = Math.max(maxInterpolationError, error);
          else maxError = Math.max(maxError, error);
        }
      }
    });
    assert(maxError < 0.00001, `bind-space error ${maxError}`);
    assert(maxInterpolationError < 0.012, `pose interpolation error ${maxInterpolationError}`);
    for (let v = 0; v < g.attributes.position.count; v += 19) assert(pose(asset, v, 0).distanceTo(new T.Vector3().fromBufferAttribute(asset.still.attributes.position, v)) < 0.00001);
  });
}

test('penguin waddle reads in silhouette while alternating feet stay grounded', () => {
  for (let tier = 0; tier < 4; tier++) {
    const model = createCrowdPenguin(T, { tier, growthScale: false, detail: 'low' });
    const clip = model.clips.find(c => c.name === 'Waddle');
    model.mixer.stopAllAction(); model.mixer.clipAction(clip).reset().play();
    const feet = ['Soft_Foot_L', 'Soft_Foot_R'].map(name => model.root.getObjectByName(name).children[0]);
    const p = new T.Vector3(), head = new T.Vector3(), lift = [0, 0];
    let left = Infinity, right = -Infinity;
    for (let frame = 0; frame < 96; frame++) {
      model.mixer.setTime(clip.duration * frame / 96); model.root.updateMatrixWorld(true);
      model.head.getWorldPosition(head); left = Math.min(left, head.x); right = Math.max(right, head.x);
      const soles = feet.map((foot, side) => {
        let sole = Infinity;
        const positions = foot.geometry.attributes.position;
        for (let v = 0; v < positions.count; v++) {
          p.fromBufferAttribute(positions, v).applyMatrix4(foot.matrixWorld);
          sole = Math.min(sole, p.y);
        }
        lift[side] = Math.max(lift[side], sole);
        assert(sole >= -.003, `tier ${tier}: foot must not pass through the ice`);
        return sole;
      });
      assert(Math.min(...soles) < .025, `tier ${tier}: keep a supporting foot on the ice`);
    }
    assert(right - left > .35, 'weight transfer should remain visible in the small silhouette');
    assert(right - left < .60, 'keep the sway compact enough for the crowd formation');
    assert(lift.every(h => h > .09), 'both feet must visibly lift in alternate steps');
    model.mixer.stopAllAction(); model.mixer.uncacheRoot(model.root);
  }
});

test('merge/split, per-tier instance capacity, shadows and fallback keep working', () => {
  const sandbox = {
    THREE: T, CharacterModels, SIZE: 1.4, W: 5, Q: { shadows: true },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), scene: new T.Scene(),
    renderer: { capabilities: { vertexTextures: true, isWebGL2: true } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/crowd.js'), 'utf8') + '\nthis.CrowdView = CrowdView;', sandbox);
  for (const kind of ['penguin', 'crab']) {
    const crowd = new sandbox.CrowdView(kind);
    let t = 0;
    for (const n of [9, 10, 9, 99, 100, 999, 1000, 1111, 30999, 0, 1]) {
      crowd.setValue(n);
      for (let frame = 0; frame < 35; frame++) { t += 1 / 60; crowd.update(1 / 60, t); }
      const want = [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10, Math.min(30, Math.floor(n / 1000))];
      assert.deepEqual(Array.from(crowd.batches, b => b.mesh.count), want);
      assert.equal(crowd.shadow.count, want.reduce((a, b) => a + b, 0));
      for (const batch of crowd.batches) assert(batch.mesh.instanceMatrix.array.every(Number.isFinite));
      assert.equal(crowd.shadow.visible, false);
    }
    sandbox.Q.shadows = false; crowd.update(1 / 60, t); assert.equal(crowd.shadow.visible, true); sandbox.Q.shadows = true;
  }
  sandbox.renderer.capabilities.vertexTextures = false;
  const fallback = new sandbox.CrowdView('penguin'); fallback.setValue(1111, { instant: true }); fallback.update(1 / 60, 0);
  assert.equal(fallback.batches[3].mesh.geometry.attributes.characterJoint, undefined);
  assert.equal(fallback.batches[3].mesh.count, 1);
});

test('impact poses move the render instances without moving collision positions', () => {
  const sandbox = { THREE: T, CharacterModels, SIZE: 1.4, W: 5, Q: { shadows: true },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), scene: new T.Scene(),
    renderer: { capabilities: { vertexTextures: true, isWebGL2: true } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/crowd.js'), 'utf8') + '\nthis.CrowdView=CrowdView;', sandbox);
  for (const kind of ['penguin', 'crab']) {
    const crowd = new sandbox.CrowdView(kind); crowd.mode = 'run'; crowd.setValue(1111, { instant: true }); crowd.update(0, 0);
    const positions = () => Array.from(crowd.tiers, list => Array.from(list, u => [u.wx, u.wz]));
    const before = positions(), matrix = new T.Matrix4(), after = new T.Matrix4();
    crowd.batches[3].mesh.getMatrixAt(0, matrix);
    crowd.impact(1, 1); crowd.celebrateImpact(); crowd.update(.06, .06);
    assert.deepEqual(positions(), before); crowd.batches[3].mesh.getMatrixAt(0, after);
    assert(!matrix.equals(after)); assert(after.elements.every(Number.isFinite));
    crowd.resetImpact(); crowd.update(0, .06); crowd.batches[3].mesh.getMatrixAt(0, after);
    assert(matrix.equals(after), 'reset must remove combat transforms');
  }
});
