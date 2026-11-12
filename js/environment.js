// Game adapter for the authored soft ice kit. Shared meshes, two materials,
// and spatial instance batches keep the scenery affordable on mobile.
(function (scope) {
'use strict';
const T = scope.THREE, shared = new WeakSet(), cache = new Map();
const linear = hex => new T.Color(hex).convertSRGBToLinear();
const materials = [
  new T.MeshPhongMaterial({ vertexColors: true, shininess: 65, specular: linear(0x9ccbd8) }),
  new T.MeshPhongMaterial({ color: linear(0xeff4fc), vertexColors: true, shininess: 5, specular: linear(0x14202a) })
];
materials.forEach(m => shared.add(m));

function source(factory, options) {
  const previous = T.ColorManagement.legacyMode;
  T.ColorManagement.legacyMode = false;
  try { return factory(T, { detail: 'low', ...options }); }
  finally { T.ColorManagement.legacyMode = previous; }
}

// Bake transforms and material colours without losing the authored smooth/flat normals.
function bake(root, transform) {
  const bins = materials.map(() => ({ position: [], normal: [], color: [], index: [] }));
  root.updateMatrixWorld(true);
  const p = new T.Vector3(), n = new T.Vector3(), normalMatrix = new T.Matrix3();
  root.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry, mat = mesh.material, bin = bins[mat.isMeshPhysicalMaterial ? 0 : 1];
    const count = g.index ? g.index.count : g.attributes.position.count;
    const used = new Set(), vertexMap = new Uint32Array(g.attributes.position.count);
    for (let i = 0; i < count; i++) used.add(g.index ? g.index.getX(i) : i);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < g.attributes.position.count; i++) {
      if (!used.has(i)) continue; // Collapsed cap rings include unused pole duplicates.
      vertexMap[i] = bin.position.length / 3;
      p.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(normalMatrix).normalize();
      if (transform) transform(p, n, mesh);
      bin.position.push(p.x, p.y, p.z); bin.normal.push(n.x, n.y, n.z);
      const c = g.attributes.color;
      bin.color.push(mat.color.r * (c ? c.getX(i) : 1), mat.color.g * (c ? c.getY(i) : 1), mat.color.b * (c ? c.getZ(i) : 1));
    }
    for (let i = 0; i < count; i++) bin.index.push(vertexMap[g.index ? g.index.getX(i) : i]);
  });
  return bins.map((bin, i) => {
    const geometry = new T.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) geometry.setAttribute(name, new T.Float32BufferAttribute(bin[name], 3));
    geometry.setIndex(bin.index); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, material: materials[i] };
  });
}

function disposeSource(root) {
  const resources = new Set();
  root.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  resources.forEach(r => r.dispose());
}

function asset(variant) {
  if (cache.has(variant)) return cache.get(variant);
  const options = variant === 'spectator' ? { variant: 'small', width: 4.9, length: 4.5, thickness: 1.65 }
    : variant === 'finish' ? { variant: 'small', width: 19.6, length: 18.2, thickness: 1.65 }
    : { variant };
  const model = source(scope.createIceFloe, options), parts = bake(model.root);
  const bounds = new T.Box3(); parts.forEach(p => { shared.add(p.geometry); bounds.union(p.geometry.boundingBox); });
  const radius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
  const result = { parts, info: { ...model.info }, radius, outline: model.outline.map(p => p.clone()) };
  cache.set(variant, result); disposeSource(model.root);
  return result;
}

function groupFrom(parts, name) {
  const group = new T.Group(); group.name = name;
  parts.forEach(part => {
    const mesh = new T.Mesh(part.geometry, part.material);
    mesh.userData.environment = true; group.add(mesh);
  });
  return group;
}

function road(width, length) {
  // Extend the middle of one slab, retaining the original rounded end bevels.
  // Tiling complete capped slabs would leave transverse dips and overlapping faces.
  const baseLength = 24, middle = 8, stretch = (length - 8) / 16;
  const model = source(scope.createIceRoad, { width, length: baseLength });
  const assembled = new T.Group(), details = new T.Group();
  model.root.children.forEach(child => {
    const copy = child.clone();
    if (child.name.startsWith('Road ')) { copy.userData.extendMiddle = true; assembled.add(copy); }
    else details.add(copy);
  });
  // Keep the little snow drifts and frost lines at their authored size.
  for (let z = -length / 2 + 13; z < length / 2 - 10; z += 24) {
    const tile = details.clone(); tile.position.z = z; assembled.add(tile);
  }
  const parts = bake(assembled, (p, n, mesh) => {
    if (!mesh.userData.extendMiddle) return;
    const sign = Math.sign(p.z), z = Math.abs(p.z), slope = z <= middle ? stretch : 1;
    p.z = sign * (z <= middle ? z * stretch : z + (length - baseLength) / 2);
    n.z /= slope; n.normalize();
  });
  disposeSource(model.root);
  const root = groupFrom(parts, 'Continuous soft ice road');
  root.traverse(o => { if (o.isMesh) o.userData.ground = true; });
  const shoreline = model.outline.map(point => {
    const p = point.clone().multiplyScalar(.955), z = Math.abs(p.y);
    p.y = Math.sign(p.y) * (z <= middle ? z * stretch : z + (length - baseLength) / 2);
    return p;
  });
  root.userData = { width, length, surfaceY: 0, playableWidth: width * .84, shoreline };
  return root;
}

function floe(variant) { return groupFrom(asset(variant).parts, 'Soft ice ' + variant); }

function driftField({ length, halfWidth, seaY, random, reserved = [] }) {
  const root = new T.Group(); root.name = 'Drifting rounded and jagged floes';
  const groups = new Map(), placements = [], dummy = new T.Object3D();
  function place(variant, side, z, far) {
    const model = asset(variant), scale = far ? 1.3 + random() * .9 : .68 + random() * .36;
    const radius = model.radius * scale;
    let x = halfWidth + (far ? 17 + random() * 24 : 2.7 + random() * 2.6) + radius;
    for (const spot of reserved) if (Math.abs(spot.z - z) < radius + spot.radius + 1 && Math.sign(spot.x) === side) x = Math.max(x, Math.abs(spot.x) + spot.radius + radius + 1);
    const entry = { variant, x: side * x, y: seaY + model.info.thickness * scale * .68, z, scale, radius, angle: random() * Math.PI * 2, phase: random() * Math.PI * 2 };
    placements.push(entry);
    const key = Math.floor(z / 56) + ':' + variant;
    if (!groups.has(key)) groups.set(key, { entries: [], model });
    groups.get(key).entries.push(entry);
  }
  const sequence = ['spiky', 'small', 'snowy', 'spiky', 'large', 'small'];
  for (let row = 0, z = 12; z > 20 - length; row++, z -= 14) {
    [-1, 1].forEach((side, i) => place(sequence[(row * 2 + i) % sequence.length], side, z + random() * 3, false));
    if (row % 2 === 0) [-1, 1].forEach(side => place(row % 4 ? 'large' : 'spiky', side, z - 6, true));
  }
  const batches = [];
  for (const { entries, model } of groups.values()) {
    const group = new T.Group(); group.name = 'Floe batch ' + entries[0].variant;
    const meshes = model.parts.map(part => {
      const mesh = new T.InstancedMesh(part.geometry, part.material, entries.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false;
      mesh.userData.environment = true; group.add(mesh); return mesh;
    });
    const minZ = Math.min(...entries.map(e => e.z - e.radius)), maxZ = Math.max(...entries.map(e => e.z + e.radius));
    batches.push({ group, entries, meshes, minZ, maxZ }); root.add(group);
  }
  function update(t, cameraZ, reducedMotion = false) {
    for (const batch of batches) {
      batch.group.visible = batch.maxZ > cameraZ - 175 && batch.minZ < cameraZ + 40;
      if (!batch.group.visible) continue;
      batch.entries.forEach((e, i) => {
        const phase = t * Math.PI * 2 / 6.8 + e.phase;
        dummy.position.set(e.x, e.y + (reducedMotion ? 0 : .025 * Math.sin(phase)), e.z);
        dummy.rotation.set(reducedMotion ? 0 : .009 * Math.sin(phase), e.angle, reducedMotion ? 0 : .012 * Math.sin(phase + .6));
        dummy.scale.setScalar(e.scale); dummy.updateMatrix();
        batch.meshes.forEach(mesh => mesh.setMatrixAt(i, dummy.matrix));
      });
      batch.meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
    }
  }
  update(0, 0);
  return { root, placements, batches, update };
}

scope.IceEnvironment = { road, floe, driftField, outline: variant => asset(variant).outline.map(p => p.clone()), isShared: resource => shared.has(resource) };
})(typeof window !== 'undefined' ? window : globalThis);
