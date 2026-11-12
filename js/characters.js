// Approved character meshes, reduced for crowds and animated in one draw per tier.
// Source factories remain editable in js/characters/. No GLB fetch or build step.
(function (scope) {
  'use strict';
  const T = scope.THREE, cache = new Map(), FRAMES = 32;
  const scaleFor = { penguin: 0.40, crab: 0.26 };

  // Collapse regular surface grids, preserving seams, closed hems and skin weights.
  // Only indices change: approved silhouettes and joint positions are sampled directly.
  function reduceGrid(g, name) {
    const uv = g.attributes.uv, index = g.index;
    if (!uv || !index) return g;
    let cols = 1;
    while (cols < uv.count && Math.abs(uv.getY(cols) - uv.getY(0)) < 1e-6) cols++;
    if (cols < 4 || uv.count % cols) return g;
    let rows = 1;
    while (rows * cols < uv.count && Math.abs(uv.getY(rows * cols) - uv.getY(0)) > 1e-6) rows++;
    if (rows === 1 || uv.count % (rows * cols)) return g;
    const layers = uv.count / (cols * rows);
    let nx = Math.max(8, Math.ceil((cols - 1) * 0.55));
    let ny = Math.max(5, Math.ceil((rows - 1) * 0.55));
    if (/silhouette|carapace$/.test(name)) { nx = 24; ny = 20; }
    if (/belly/.test(name)) { nx = 16; ny = 16; }
    if (/cloth collar/.test(name)) { nx = 32; ny = 8; }
    if (/crown|Crown/.test(name)) nx = Math.max(30, nx);
    if (/zigzag/.test(name)) { nx = cols - 1; ny = rows - 1; }
    nx = Math.min(cols - 1, nx); ny = Math.min(rows - 1, ny);
    const nearest = (n, target) => {
      const chosen = Array.from({ length: target + 1 }, (_, i) => Math.round(i * n / target));
      return Array.from({ length: n + 1 }, (_, i) => chosen.reduce((a, b) => Math.abs(b - i) < Math.abs(a - i) ? b : a));
    };
    const xs = nearest(cols - 1, nx), ys = nearest(rows - 1, ny), remap = [];
    for (let l = 0; l < layers; l++) for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) remap.push(l * cols * rows + ys[y] * cols + xs[x]);
    const triangles = [], seen = new Set();
    for (let i = 0; i < index.count; i += 3) {
      const a = remap[index.getX(i)], b = remap[index.getX(i + 1)], c = remap[index.getX(i + 2)];
      if (a === b || b === c || a === c) continue;
      const key = [a, b, c].sort((u, v) => u - v).join(',');
      if (!seen.has(key)) { seen.add(key); triangles.push(a, b, c); }
    }
    const kept = [...new Set(triangles)], lookup = new Map(kept.map((v, i) => [v, i])), out = new T.BufferGeometry();
    for (const [key, attr] of Object.entries(g.attributes)) {
      const data = new attr.array.constructor(kept.length * attr.itemSize);
      kept.forEach((v, i) => data.set(attr.array.subarray(v * attr.itemSize, (v + 1) * attr.itemSize), i * attr.itemSize));
      out.setAttribute(key, new T.BufferAttribute(data, attr.itemSize, attr.normalized));
    }
    out.setIndex(triangles.map(v => lookup.get(v)));
    return out;
  }

  function build(kind, tier) {
    // Existing scenery converts sRGB explicitly; the authoring models use ColorManagement.
    const legacy = T.ColorManagement.legacyMode;
    T.ColorManagement.legacyMode = false;
    let model;
    try {
      model = (kind === 'penguin' ? scope.createCrowdPenguin : scope.createCrowdCrab)(T, { tier, growthScale: false, detail: 'low' });
    } finally { T.ColorManagement.legacyMode = legacy; }
    model.mixer.stopAllAction(); model.root.updateMatrixWorld(true);
    const normalize = new T.Matrix4().makeRotationY(kind === 'penguin' ? Math.PI : 0);
    normalize.scale(new T.Vector3().setScalar(scaleFor[kind]));
    const meshes = []; model.root.traverse(o => { if (o.isMesh) meshes.push(o); });
    const nodes = [], positions = [], normals = [], colors = [], joints = [], weights = [], indices = [];
    const p = new T.Vector3(), n = new T.Vector3(), bindNormal = new T.Matrix3();
    for (const mesh of meshes) {
      const g = reduceGrid(mesh.geometry, mesh.name), pos = g.attributes.position, nor = g.attributes.normal;
      const offset = positions.length / 3, first = nodes.length, mat = mesh.material;
      // Tiny weave texels become a fabric colour at game distance; curved folds stay geometry.
      const color = mat.color.clone();
      if (mat.map) {
        const hex = /woven rust/.test(mat.name) ? 0xba7356 : /knitted wool/.test(mat.name) ? 0xb67455 : 0xf0f0f0;
        color.multiply(new T.Color(hex).convertSRGBToLinear());
      }
      // Lift dark and mid-tone albedo without whitening the palette or clipping ivory.
      // Keep pupils and mouth lines dark so expressions stay legible at game distance.
      const keepInk = /eyes|mouth/i.test(mat.name), tone = kind === 'penguin' ? .72 : .64;
      const chroma = kind === 'penguin' ? 1.28 : 1.32;
      if (mesh.isSkinnedMesh) {
        mesh.skeleton.bones.forEach((bone, i) => nodes.push({ bone, inverse: mesh.skeleton.boneInverses[i] }));
        bindNormal.getNormalMatrix(mesh.bindMatrix);
      } else nodes.push({ mesh });
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
        if (mesh.isSkinnedMesh) { p.applyMatrix4(mesh.bindMatrix); n.applyMatrix3(bindNormal).normalize(); }
        positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z);
        const vc = g.attributes.color;
        const red = color.r * (vc ? vc.getX(i) : 1), green = color.g * (vc ? vc.getY(i) : 1), blue = color.b * (vc ? vc.getZ(i) : 1);
        const peak = Math.max(red, green, blue), lift = keepInk || peak <= 0 ? 1 : Math.pow(peak, tone) / peak;
        const r = red * lift, greenLit = green * lift, b = blue * lift;
        const hi = Math.max(r, greenLit, b), lo = Math.min(r, greenLit, b), luminance = .2126 * r + .7152 * greenLit + .0722 * b;
        // Increase chroma at constant luminance. Leave ivory/ink alone, and stop
        // at the RGB gamut boundary instead of clipping channels or shifting hue.
        const saturation = keepInk || hi - lo < hi * .18 ? 1 : Math.min(chroma,
          luminance / Math.max(luminance - lo, 1e-6), (1 - luminance) / Math.max(hi - luminance, 1e-6));
        colors.push(luminance + (r - luminance) * saturation,
          luminance + (greenLit - luminance) * saturation, luminance + (b - luminance) * saturation);
        for (let k = 0; k < 2; k++) {
          // These authored rigs use at most two influences at every vertex.
          joints.push(first + (mesh.isSkinnedMesh ? g.attributes.skinIndex.array[i * 4 + k] : 0));
          weights.push(mesh.isSkinnedMesh ? g.attributes.skinWeight.array[i * 4 + k] : k === 0 ? 1 : 0);
        }
      }
      for (let i = 0; i < g.index.count; i++) indices.push(offset + g.index.getX(i));
      if (g !== mesh.geometry) g.dispose();
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('characterJoint', new T.Float32BufferAttribute(joints, 2));
    geometry.setAttribute('characterWeight', new T.Float32BufferAttribute(weights, 2));
    geometry.setIndex(indices);

    // Three affine rows per joint; 32 poses for each of the four clips (idle, move, wave, attack),
    // interpolated by the vertex shader.
    // Each instance has its own phase. No per-character mixers or per-frame vertex uploads.
    const width = nodes.length * 3, height = FRAMES * model.clips.length;
    const data = new Float32Array(width * height * 4), matrix = new T.Matrix4();
    const durations = model.clips.map(c => c.duration);
    model.clips.forEach((clip, c) => {
      model.mixer.stopAllAction(); model.mixer.clipAction(clip).reset().play();
      for (let f = 0; f < FRAMES; f++) {
        model.mixer.setTime(clip.duration * f / FRAMES); model.root.updateMatrixWorld(true);
        nodes.forEach((node, j) => {
          if (node.bone) matrix.multiplyMatrices(node.bone.matrixWorld, node.inverse);
          else matrix.copy(node.mesh.matrixWorld);
          matrix.premultiply(normalize);
          const e = matrix.elements, at = ((c * FRAMES + f) * width + j * 3) * 4;
          data.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], at);
        });
      }
    });
    const texture = new T.DataTexture(data, width, height, T.RGBAFormat, T.FloatType);
    texture.minFilter = texture.magFilter = T.NearestFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    // Bake a complete neutral pose for death effects and devices without vertex textures.
    const still = geometry.clone(), sp = still.attributes.position, sn = still.attributes.normal;
    const poseMatrix = (joint, out) => {
      const at = joint * 12;
      return out.set(data[at], data[at + 1], data[at + 2], data[at + 3], data[at + 4], data[at + 5], data[at + 6], data[at + 7], data[at + 8], data[at + 9], data[at + 10], data[at + 11], 0, 0, 0, 1);
    };
    const a = new T.Matrix4(), b = new T.Matrix4();
    for (let i = 0; i < sp.count; i++) {
      poseMatrix(joints[i * 2], a); poseMatrix(joints[i * 2 + 1], b);
      for (let k = 0; k < 16; k++) a.elements[k] = a.elements[k] * weights[i * 2] + b.elements[k] * weights[i * 2 + 1];
      p.fromBufferAttribute(sp, i).applyMatrix4(a); sp.setXYZ(i, p.x, p.y, p.z);
      n.fromBufferAttribute(sn, i).applyMatrix3(bindNormal.getNormalMatrix(a)).normalize(); sn.setXYZ(i, n.x, n.y, n.z);
    }
    still.deleteAttribute('characterJoint'); still.deleteAttribute('characterWeight'); still.computeBoundingBox(); still.computeBoundingSphere();
    model.mixer.stopAllAction(); model.mixer.uncacheRoot(model.root);
    const materials = new Set(), maps = new Set();
    meshes.forEach(m => { m.geometry.dispose(); materials.add(m.material); if (m.material.map) maps.add(m.material.map); });
    materials.forEach(m => m.dispose()); maps.forEach(m => m.dispose());
    return { geometry, still, texture, durations, height: still.boundingBox.max.y, triangles: indices.length / 3, joints: nodes.length };
  }

  const vertex = `
    uniform sampler2D characterPoses;
    uniform vec2 characterAtlasSize;
    uniform float characterTime;
    uniform float characterClip;
    uniform float characterPreviousClip;
    uniform float characterTransition;
    uniform vec4 characterDurations;
    attribute vec2 characterJoint;
    attribute vec2 characterWeight;
    attribute float characterPhase;
    vec4 poseRow(float joint, float row, float frame) {
      return texture2D(characterPoses, vec2((joint * 3.0 + row + 0.5) / characterAtlasSize.x, (frame + 0.5) / characterAtlasSize.y));
    }
    mat4 jointPose(float joint, float clip) {
      float duration = clip < 0.5 ? characterDurations.x : (clip < 1.5 ? characterDurations.y : (clip < 2.5 ? characterDurations.z : characterDurations.w));
      float phase = fract(characterTime / duration + characterPhase) * 32.0;
      float f = floor(phase), next = mod(f + 1.0, 32.0), t = fract(phase);
      f += clip * 32.0; next += clip * 32.0;
      vec4 r0 = mix(poseRow(joint, 0.0, f), poseRow(joint, 0.0, next), t);
      vec4 r1 = mix(poseRow(joint, 1.0, f), poseRow(joint, 1.0, next), t);
      vec4 r2 = mix(poseRow(joint, 2.0, f), poseRow(joint, 2.0, next), t);
      return mat4(vec4(r0.x,r1.x,r2.x,0.0), vec4(r0.y,r1.y,r2.y,0.0), vec4(r0.z,r1.z,r2.z,0.0), vec4(r0.w,r1.w,r2.w,1.0));
    }
    mat4 animatedJoint(float joint) {
      mat4 pose = jointPose(joint, characterClip);
      if (characterTransition < 1.0) pose = jointPose(joint, characterPreviousClip) * (1.0 - characterTransition) + pose * characterTransition;
      return pose;
    }
    mat4 characterSkin() {
      mat4 pose = animatedJoint(characterJoint.x) * characterWeight.x;
      if (characterWeight.y > 0.0) pose += animatedJoint(characterJoint.y) * characterWeight.y;
      return pose;
    }
  `;

  function batch(kind, tier, capacity, animated = true) {
    const asset = get(kind, tier), geometry = (animated ? asset.geometry : asset.still).clone();
    const phase = new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('characterPhase', phase);
    const uniforms = {
      characterPoses: { value: asset.texture }, characterAtlasSize: { value: new T.Vector2(asset.texture.image.width, asset.texture.image.height) },
      characterTime: { value: 0 }, characterClip: { value: 0 }, characterPreviousClip: { value: 0 }, characterTransition: { value: 1 },
      characterDurations: { value: new T.Vector4(...asset.durations) }
    };
    // Neutral exposure complements the baked palette lift across every growth tier.
    const material = new T.MeshLambertMaterial({ color: new T.Color(1.16, 1.16, 1.16), vertexColors: true });
    const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
    const patch = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertex);
      shader.vertexShader = shader.vertexShader.replace('void main() {', 'void main() {\nmat4 characterTransform = characterSkin();');
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        // Inverse transpose also handles the 20% narrower body and eye blinks.
        vec3 ca = characterTransform[0].xyz, cb = characterTransform[1].xyz, cc = characterTransform[2].xyz;
        objectNormal = normalize(mat3(cross(cb, cc), cross(cc, ca), cross(ca, cb)) * objectNormal);
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = (characterTransform * vec4(position, 1.0)).xyz;');
    };
    if (animated) { material.onBeforeCompile = depth.onBeforeCompile = patch; material.customProgramCacheKey = depth.customProgramCacheKey = () => 'crowd-character-v2'; }
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    mesh.customDepthMaterial = depth; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.count = 0; mesh.userData.crowd = true;
    let active = 0, elapsed = 1;
    return {
      mesh, asset, phase,
      update(dt, time, mode) {
        const clip = mode === 'run' ? 1 : mode === 'cheer' || mode === 'wave' ? 2 : mode === 'fight' ? 3 : 0;
        if (clip !== active) { uniforms.characterPreviousClip.value = active; active = clip; elapsed = 0; }
        elapsed += dt; uniforms.characterTransition.value = Math.min(1, elapsed / 0.28);
        uniforms.characterClip.value = active;
        uniforms.characterTime.value = time / (kind === 'penguin' ? 1 + tier * 0.15 : 1);
      },
      flush(count) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; phase.needsUpdate = true; }
    };
  }
  function get(kind, tier) {
    const key = kind + tier;
    if (!cache.has(key)) cache.set(key, build(kind, tier));
    return cache.get(key);
  }
  scope.CharacterModels = { get, batch };
})(typeof window !== 'undefined' ? window : globalThis);
