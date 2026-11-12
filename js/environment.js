// Game adapter for the authored soft ice kit. Shared meshes, two materials,
// and spatial instance batches keep the scenery affordable on mobile.
(function (scope) {
'use strict';
const T = scope.THREE, shared = new WeakSet(), cache = new Map();
// Edit these ranges to tune the small floes. Scale is relative to each source
// model; gaps are world units between conservative footprint circles.
const FLOE_LAYOUT = {
  smallScale: { min: .43, max: 1.03 },
  smallSnowyScale: { min: .4, max: .64 },
  gap: { min: .9, max: 2.1 },
  clusterSpacing: 21 // Minimum distance between the first floes of two clusters.
};
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
  const sample = range => range.min + random() * (range.max - range.min);
  const root = new T.Group(); root.name = 'Drifting rounded and jagged floes';
  const groups = new Map(), placements = [], dummy = new T.Object3D();
  const clearings = [], clusters = [], minZ = 20 - length, maxZ = 18;
  // Reserve irregular stretches of open near-shore water on each side.
  // Leave the spectator islands and finish outside these quiet stretches.
  for (const side of [-1, 1]) {
    const count = length > 320 ? 2 : 1;
    for (let i = 0; i < count; i++) for (let attempt = 0; attempt < 40; attempt++) {
      const gap = { side, z: -48 - random() * Math.max(1, length - 112), halfLength: 9 + random() * 8, edge: halfWidth + 22 };
      if (reserved.some(s => (Math.sign(s.x) === side || s.x === 0) && Math.abs(s.x) - s.radius < gap.edge && Math.abs(s.z - gap.z) < s.radius + gap.halfLength + 2)) continue;
      if (clearings.some(g => g.side === side && Math.abs(g.z - gap.z) < g.halfLength + gap.halfLength + 8)) continue;
      clearings.push(gap); break;
    }
  }
  function make(size, variant) {
    if (!variant) variant = size === 'small' ? (random() < .84 ? 'small' : 'snowy')
      : size === 'medium' ? (random() < .55 ? 'snowy' : 'large') : (random() < .6 ? 'spiky' : 'large');
    const model = asset(variant);
    const scale = size === 'small' ? sample(variant === 'small' ? FLOE_LAYOUT.smallScale : FLOE_LAYOUT.smallSnowyScale)
      : size === 'medium' ? (variant === 'snowy' ? .72 + random() * .38 : .62 + random() * .29) : .94 + random() * .85;
    const thickness = model.info.thickness * scale;
    // Keep tiny floes submerged even at the lowest swell plus the highest bob.
    const freeboard = Math.min(thickness * .68, thickness - .13);
    // The envelope includes the tiny horizontal movement caused by the bobbing tilt.
    return { variant, size, scale, radius: model.radius * scale + .1, x: 0, z: 0,
      y: seaY + freeboard, gap: sample(FLOE_LAYOUT.gap),
      angle: random() * Math.PI * 2, phase: random() * Math.PI * 2, cluster: -1 };
  }
  function fits(e, trial = []) {
    const side = Math.sign(e.x), edge = Math.abs(e.x) - e.radius;
    if (edge < halfWidth + 2.7 || Math.abs(e.x) + e.radius > halfWidth + 58 || e.z - e.radius < minZ || e.z + e.radius > maxZ) return false;
    if (e.size === 'large' && edge < halfWidth + 16) return false;
    if (clearings.some(g => g.side === side && edge < g.edge && Math.abs(e.z - g.z) < e.radius + g.halfLength)) return false;
    const overlaps = other => Math.hypot(e.x - other.x, e.z - other.z) < e.radius + other.radius + Math.max(e.gap, other.gap || 1.2);
    return !reserved.some(overlaps) && !placements.some(overlaps) && !trial.some(overlaps);
  }
  function cluster(side, opening) {
    const count = 2 + Math.floor(random() * 3);
    for (let attempt = 0; attempt < 40; attempt++) {
      const first = make('small');
      first.x = side * (halfWidth + (opening ? 6.5 + random() * 6.5 : 5 + random() * 21));
      first.z = opening ? -18 - random() * 16 : minZ + 12 + random() * (length - 30);
      if (!fits(first) || clusters.some(c => Math.hypot(c.x - first.x, c.z - first.z) < FLOE_LAYOUT.clusterSpacing)) continue;
      const trial = [first];
      for (let i = 1; i < count; i++) for (let attempt = 0; attempt < 28; attempt++) {
        const e = make('small'), parent = trial[Math.floor(random() * trial.length)];
        const angle = random() * Math.PI * 2, distance = parent.radius + e.radius + Math.max(parent.gap, e.gap) + .1 + random() * 1.6;
        e.x = parent.x + Math.cos(angle) * distance; e.z = parent.z + Math.sin(angle) * distance;
        if (Math.sign(e.x) !== side || Math.hypot(e.x - first.x, e.z - first.z) > 11 || !fits(e, trial)) continue;
        trial.push(e); break;
      }
      if (trial.length < 2) continue;
      trial.forEach(e => { e.cluster = clusters.length; placements.push(e); });
      clusters.push({ x: first.x, z: first.z, side }); return;
    }
  }
  // Independent positions on each side: no rows, mirrored pairs or model sequence.
  const openingSide = random() < .5 ? -1 : 1;
  for (const side of [openingSide, -openingSide]) {
    const count = Math.ceil(length / 78) + (random() < .35 ? 1 : 0);
    for (let i = 0; i < count; i++) cluster(side, i === 0 && side === openingSide);
  }
  for (const size of ['medium', 'large']) {
    const count = size === 'medium' ? Math.ceil(length / 45) : Math.max(2, Math.round(length / 140));
    for (let i = 0; i < count; i++) for (let attempt = 0; attempt < 70; attempt++) {
      const e = make(size, size === 'large' && i === 0 ? 'spiky' : undefined), side = random() < .5 ? -1 : 1;
      e.x = side * (halfWidth + e.radius + (size === 'large' ? 16 + random() * (i === 0 ? 12 : 28) : 7 + random() * 29));
      e.z = size === 'large' && i === 0 ? -46 - random() * 35 : minZ + e.radius + random() * (maxZ - minZ - e.radius * 2);
      if (!fits(e)) continue;
      placements.push(e); break;
    }
  }
  for (const e of placements) {
    const key = Math.floor(e.z / 56) + ':' + e.variant;
    if (!groups.has(key)) groups.set(key, { entries: [], model: asset(e.variant) });
    groups.get(key).entries.push(e);
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
  return { root, placements, clearings, batches, update };
}

scope.IceEnvironment = { road, floe, driftField, radius: variant => asset(variant).radius,
  outline: variant => asset(variant).outline.map(p => p.clone()), isShared: resource => shared.has(resource) };
})(typeof window !== 'undefined' ? window : globalThis);
