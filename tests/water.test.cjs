const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = global.THREE = require(process.env.THREE_PATH || 'three');
require('../js/water.js');
require('../js/environment/ice-models.js');
require('../js/environment.js');

test('ice contact contours follow the same scale, yaw and position as the floes', () => {
  const water = createStylizedWater(T, -1.4);
  for (const variant of ['small', 'snowy', 'large', 'spiky']) {
    const shape = IceEnvironment.outline(variant), placement = { x: 17, z: -35, scale: 1.7, angle: .74 };
    const contour = water.outline(shape, placement), transform = new T.Object3D();
    transform.position.set(placement.x, 0, placement.z); transform.scale.setScalar(placement.scale); transform.rotation.y = placement.angle; transform.updateMatrix();
    contour.points.forEach((p, i) => {
      const expected = new T.Vector3(shape[i].x, 0, shape[i].y).applyMatrix4(transform.matrix);
      assert(Math.hypot(expected.x - p.x, expected.z - p.y) < 1e-10);
    });
    const root = water.createContacts([contour]);
    for (const mesh of root.children) {
      const g = mesh.geometry;
      assert(g.attributes.position.array.every(Number.isFinite));
      assert(g.index.array.every(i => i < g.attributes.position.count));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) assert(Math.abs(p.getY(i) + 1.382) < .00001, 'foam belongs on the waterline, not on top of the snow');
      assert.equal(mesh.material.depthWrite, false);
      assert.equal(mesh.material.uniforms.uWaterTime, water.uniforms.uWaterTime);
      g.dispose();
    }
    root.children[0].material.dispose();
  }
  water.mesh.geometry.dispose(); water.mesh.material.dispose();
});

test('sea and foam share reduced-motion time; rebuilt coastlines do not alter shared water', () => {
  const water = createStylizedWater(T, -1.4), road = IceEnvironment.road(12.6, 426);
  const contour = water.outline(road.userData.shoreline, { z: -193 });
  let vertices;
  for (let rebuild = 0; rebuild < 4; rebuild++) {
    const root = water.createContacts([contour]), counts = root.children.map(m => m.geometry.attributes.position.count);
    if (vertices) assert.deepEqual(counts, vertices); else vertices = counts;
    assert(root.children.length > 1, 'the long coastline is split into cullable chunks');
    water.update(14, false);
    assert.equal(water.uniforms.uWaterTime.value, 14);
    root.children.forEach(m => assert.equal(m.material.uniforms.uWaterTime.value, 14));
    water.update(23, true);
    assert.equal(water.uniforms.uWaterTime.value, 0);
    root.children.forEach(m => { assert.equal(m.material.uniforms.uWaterTime.value, 0); m.geometry.dispose(); });
    root.children[0].material.dispose();
    assert(water.mesh.geometry.attributes.position.array.every(Number.isFinite));
  }
  assert.equal(water.mesh.receiveShadow, true);
  assert.equal(water.mesh.material.transparent, false);
  road.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  water.mesh.geometry.dispose(); water.mesh.material.dispose();
});
