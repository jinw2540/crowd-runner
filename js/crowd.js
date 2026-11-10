// Penguin and crab models, crowd formation and animation, and particle effects.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Crowd ---------- */
// Characters are built once from simple shapes with per-vertex colours, then drawn as instances.
function tint(g, hex) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex).convertSRGBToLinear(), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function ball(r, sx, sy, sz, x, y, z, hex, seg) {
  const g = new THREE.SphereGeometry(r, seg || 10, seg ? Math.max(4, seg - 2) : 8);
  g.scale(sx, sy, sz); g.translate(x, y, z);
  return tint(g, hex);
}
function cone(r, h, rotX, x, y, z, hex) {
  const g = new THREE.ConeGeometry(r, h, 8);
  g.rotateX(rotX); g.translate(x, y, z);
  return tint(g, hex);
}
function merge(parts) {
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const NAVY = 0x27408b, SNOW = 0xffffff, BEAK = 0xff9f1c, FOOT = 0xffc21a, CRAB = 0xf23d4f, CRAB_D = 0xc4213a;
const CAP = 0x1c3070, GREY = 0xb4b4b4;   // GREY darkens whatever colour a scarf is tinted with
const MODELS = {
  // Penguin faces -z (away from the camera): navy back with a lighter saddle, white belly, yellow feet, stubby tail.
  penguin: {
    body: merge([
      ball(0.24, 1, 1.25, 0.95, 0, 0.32, 0, NAVY, 12),
      ball(0.2, 0.8, 0.95, 0.5, 0, 0.36, 0.14, 0x3a5bb5, 10),
      ball(0.2, 0.96, 1.19, 0.6, 0, 0.3, -0.106, 0xaec8ec),
      ball(0.2, 0.88, 1.12, 0.6, 0, 0.3, -0.12, SNOW),
      ball(0.19, 1, 1, 1, 0, 0.67, 0, NAVY, 12),
      ball(0.19, 1.03, 0.55, 1.03, 0, 0.74, 0.01, CAP, 12),
      cone(0.04, 0.11, 0.35, 0, 0.87, 0.03, CAP),
      ball(0.14, 1.05, 0.9, 0.5, 0, 0.66, -0.125, SNOW),
      ball(0.04, 1, 0.7, 0.5, -0.105, 0.63, -0.168, 0xff9db5, 6),
      ball(0.04, 1, 0.7, 0.5, 0.105, 0.63, -0.168, 0xff9db5, 6),
      ball(0.026, 1, 1, 1, -0.07, 0.71, -0.185, 0x10162e, 6),
      ball(0.026, 1, 1, 1, 0.07, 0.71, -0.185, 0x10162e, 6),
      cone(0.05, 0.13, -Math.PI / 2, 0, 0.64, -0.23, BEAK),
      cone(0.07, 0.16, Math.PI * 0.62, 0, 0.14, 0.24, NAVY),
      ball(0.08, 1.05, 0.4, 1.5, -0.1, 0.03, -0.06, FOOT, 8),
      ball(0.08, 1.05, 0.4, 1.5, 0.1, 0.03, -0.06, FOOT, 8)
    ]),
    limbs: merge([
      ball(0.13, 0.3, 1.05, 0.62, -0.255, 0.36, 0, NAVY, 8),
      ball(0.13, 0.3, 1.05, 0.62, 0.255, 0.36, 0, NAVY, 8),
      ball(0.07, 0.3, 0.7, 0.7, -0.262, 0.27, 0, 0x3a5bb5, 6),
      ball(0.07, 0.3, 0.7, 0.7, 0.262, 0.27, 0, 0x3a5bb5, 6)
    ]),
    // Knitted scarf: a striped ring, a striped tail down the back and a tassel
    scarf: merge([
      ball(0.205, 1, 0.3, 1, 0, 0.535, 0, SNOW, 12),
      ball(0.2, 1, 0.09, 1, 0, 0.562, 0, GREY, 12),
      ball(0.2, 1, 0.09, 1, 0, 0.508, 0, GREY, 12),
      ball(0.065, 0.8, 0.75, 0.5, 0.06, 0.5, 0.2, SNOW, 6),
      ball(0.065, 0.8, 0.75, 0.5, 0.06, 0.43, 0.215, GREY, 6),
      ball(0.065, 0.8, 0.75, 0.5, 0.06, 0.36, 0.225, SNOW, 6),
      ball(0.022, 1, 1.6, 1, 0.03, 0.29, 0.23, GREY, 5), ball(0.022, 1, 1.6, 1, 0.06, 0.285, 0.232, GREY, 5), ball(0.022, 1, 1.6, 1, 0.09, 0.29, 0.23, GREY, 5)
    ])
  },
  // Crab faces +z (towards the camera): spotted shell with a darker rim, eyes on stalks, jointed legs, pincers that open.
  crab: {
    body: merge([
      ball(0.24, 1.38, 0.4, 1.02, 0, 0.17, 0, CRAB_D, 12),
      ball(0.24, 1.3, 0.62, 0.95, 0, 0.21, 0, CRAB, 12),
      ball(0.05, 1.3, 0.4, 1, -0.11, 0.343, -0.04, 0xff8a94, 6), ball(0.05, 1.2, 0.4, 1, 0.12, 0.34, -0.07, 0xff8a94, 6), ball(0.04, 1.2, 0.4, 1, 0.01, 0.352, -0.12, 0xff8a94, 6),
      ball(0.03, 1, 2.2, 1, -0.1, 0.35, 0.1, CRAB, 6), ball(0.03, 1, 2.2, 1, 0.1, 0.35, 0.1, CRAB, 6),
      ball(0.065, 1, 1, 1, -0.1, 0.44, 0.1, SNOW, 8), ball(0.065, 1, 1, 1, 0.1, 0.44, 0.1, SNOW, 8),
      ball(0.032, 1, 1, 1, -0.1, 0.45, 0.155, 0x10162e, 6), ball(0.032, 1, 1, 1, 0.1, 0.45, 0.155, 0x10162e, 6),
      ...[-0.13, -0.01, 0.11].flatMap(z => [-1, 1].flatMap(sd => [
        ball(0.04, 2, 0.75, 0.75, sd * 0.33, 0.14, z, CRAB_D, 6),
        ball(0.035, 0.75, 2.1, 0.75, sd * 0.42, 0.07, z, CRAB_D, 6)
      ])),
      ball(0.06, 1.6, 0.8, 0.8, -0.31, 0.26, 0.1, CRAB_D, 6), ball(0.06, 1.6, 0.8, 0.8, 0.31, 0.26, 0.1, CRAB_D, 6),
      ball(0.1, 1.15, 0.5, 0.85, -0.4, 0.3, 0.15, CRAB_D, 8), ball(0.1, 1.15, 0.5, 0.85, 0.4, 0.3, 0.15, CRAB_D, 8)
    ]),
    limbs: merge([
      ball(0.1, 1.15, 0.55, 0.85, -0.4, 0.385, 0.15, CRAB, 8),
      ball(0.1, 1.15, 0.55, 0.85, 0.4, 0.385, 0.15, CRAB, 8)
    ])
  }
};
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color();
const SCARVES = [0xffc21a, 0xff5a5f, 0x2fd0a8, 0xff8fc7].map(h => new THREE.Color(h).convertSRGBToLinear());
const shadowGeo = new THREE.CircleGeometry(0.27, 12); shadowGeo.rotateX(-Math.PI / 2);
class CrowdView {
  constructor(max, kind) {
    this.max = max; this.n = 0; this.cx = 0; this.cz = 0; this.hop = 1; this.crab = kind === 'crab';
    this.mode = null;                 // 'run' | 'idle' | 'cheer'; null falls back to hop
    this.tilt = 0; this.tiltT = 0;    // lean into steering
    this.arms = 0; this.armsT = 0;    // wings or claws raised
    this.jump = 0; this.flinch = 0;   // one-shot reactions, 1 -> 0
    this.ox = new Float32Array(max); this.oz = new Float32Array(max); this.ph = new Float32Array(max);
    this.sc = new Float32Array(max); this.sz = new Float32Array(max);
    const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    this.body = new THREE.InstancedMesh(MODELS[kind].body, mat(), max);
    this.limbs = new THREE.InstancedMesh(MODELS[kind].limbs, mat(), max);
    this.shadow = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x0a2a4a, transparent: true, opacity: 0.2, depthWrite: false }), max);
    this.meshes = [this.body, this.limbs, this.shadow];
    if (MODELS[kind].scarf) {
      this.scarf = new THREE.InstancedMesh(MODELS[kind].scarf, mat(), max);
      for (let i = 0; i < max; i++) this.scarf.setColorAt(i, SCARVES[0]);
      this.meshes.push(this.scarf);
    }
    this.group = new THREE.Group();
    for (const m of this.meshes) { m.frustumCulled = false; m.count = 0; m.userData.crowd = true; m.castShadow = m !== this.shadow; this.group.add(m); }
  }
  get radius() { return SPACING * Math.sqrt(this.n) + 0.3; }
  setCount(n) {
    n = Math.min(n, this.max);
    for (let i = this.n; i < n; i++) {
      const a = Math.random() * 6.283;
      this.ox[i] = Math.cos(a) * 0.3; this.oz[i] = Math.sin(a) * 0.3; this.ph[i] = Math.random() * 6.283;
      this.sc[i] = 0.2; this.sz[i] = 0.84 + Math.random() * 0.36;
      if (this.scarf) this.scarf.setColorAt(i, SCARVES[Math.floor(Math.random() * SCARVES.length)]);
    }
    this.n = n;
  }
  snap() {
    for (let i = 0; i < this.n; i++) {
      const r = SPACING * Math.sqrt(i), a = i * 2.39996;
      this.ox[i] = Math.cos(a) * r; this.oz[i] = Math.sin(a) * r; this.sc[i] = 1;
    }
  }
  removeAt(i) {
    const l = this.n - 1;
    this.ox[i] = this.ox[l]; this.oz[i] = this.oz[l]; this.ph[i] = this.ph[l]; this.sc[i] = this.sc[l]; this.sz[i] = this.sz[l];
    if (this.scarf) { this.scarf.getColorAt(l, tmpCol); this.scarf.setColorAt(i, tmpCol); }
    this.n = l;
  }
  wx(i) { return clamp(this.cx + this.ox[i], -W + 0.25, W - 0.25); }
  wz(i) { return this.cz + this.oz[i]; }
  update(dt, t) {
    const mode = this.mode || (this.hop >= 1 ? 'run' : 'idle'), crab = this.crab;
    const k = 1 - Math.exp(-dt * 7), grow = dt * 5;
    this.tilt += (this.tiltT - this.tilt) * Math.min(1, dt * 9);
    this.arms += (this.armsT - this.arms) * Math.min(1, dt * 8);
    this.jump = Math.max(0, this.jump - dt / 0.42);
    this.flinch = Math.max(0, this.flinch - dt / 0.45);
    const jumpY = this.jump > 0 ? Math.sin((1 - this.jump) * Math.PI) * 0.7 : 0;
    const arms = this.arms, flinch = this.flinch;
    for (let i = 0; i < this.n; i++) {
      const r = SPACING * Math.sqrt(i), a = i * 2.39996, ph = this.ph[i];
      this.ox[i] += (Math.cos(a) * r - this.ox[i]) * k;
      this.oz[i] += (Math.sin(a) * r - this.oz[i]) * k;
      const size = (this.sc[i] = Math.min(1, this.sc[i] + grow)) * SIZE * this.sz[i] * (1 - flinch * 0.18);
      // st is vertical stretch: below 1 squashes on landing, above 1 stretches in the air
      let y = 0, rx = 0, ry = 0, rz = 0, st = 1, side = 0, flap = 0;
      if (mode === 'run') {
        const w = Math.sin(t * 10 + ph), up = Math.abs(w);
        flap = 0.5 + 0.5 * Math.sin(t * 20 + ph * 3);
        if (crab) { side = w * 0.09; y = up * 0.05; st = 1 + (up - 0.5) * 0.16; rz = w * 0.08; }
        else { y = up * 0.1; st = 1 + (up - 0.5) * 0.22; rz = w * 0.2 - this.tilt * 0.32; rx = -0.2 + flinch * 0.5; }
      } else if (mode === 'cheer') {
        const up = Math.abs(Math.sin(t * 7 + ph));
        y = up * 0.55; st = 1 + (up - 0.4) * 0.28; ry = t * 5 + ph; flap = 1;
      } else {
        st = 1 + Math.sin(t * 2.2 + ph) * 0.035;
        ry = Math.sin(t * 0.7 + ph * 2) * (crab ? 0.2 : 0.55);
        if (Math.sin(t * 0.9 + ph * 1.7) > 0.85) flap = 0.5 + 0.5 * Math.sin(t * 26);
      }
      if (jumpY > 0) { y += jumpY * (0.8 + (ph % 1) * 0.4); st += jumpY * 0.25; }
      const wide = 1 / Math.sqrt(st), x = this.wx(i) + side, z = this.wz(i), yy = y * SIZE;
      dummy.position.set(x, yy, z);
      dummy.rotation.set(rx, ry, rz);
      dummy.scale.set(size * wide, size * st, size * wide);
      dummy.updateMatrix();
      this.body.setMatrixAt(i, dummy.matrix);
      if (this.scarf) this.scarf.setMatrixAt(i, dummy.matrix);
      // Wings spread and lift; claws pinch and reach up.
      if (crab) dummy.scale.set(size * wide, size * st * (1 + flap * 0.35 + arms * 0.3), size * wide);
      else { dummy.scale.set(size * wide * (1 + flap * 0.3 + arms * 0.4), size * st, size * wide); dummy.position.y = yy + arms * 0.14 * size; }
      dummy.updateMatrix();
      this.limbs.setMatrixAt(i, dummy.matrix);
      const sh = size * (crab ? 1.3 : 1) * Math.max(0.4, 1 - y * 0.8);
      dummy.position.set(x, 0.045, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sh, 1, sh);
      dummy.updateMatrix();
      this.shadow.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.set(1, 1, 1);
    for (const m of this.meshes) { m.count = this.n; m.instanceMatrix.needsUpdate = true; }
    this.shadow.visible = !Q.shadows;
    if (this.scarf) this.scarf.instanceColor.needsUpdate = true;
  }
}

/* ---------- Effects: snow puffs, splashes, and penguins bouncing away ---------- */
const Fx = (() => {
  const PN = 160, GN = 30, P = [], Gh = [];
  const puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), PN);
  const ghosts = new THREE.InstancedMesh(MODELS.penguin.body, new THREE.MeshLambertMaterial({ vertexColors: true }), GN);
  puffs.frustumCulled = ghosts.frustumCulled = false;
  scene.add(puffs, ghosts);
  for (let i = 0; i < PN; i++) { P.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 }); puffs.setColorAt(i, tmpCol.set(0xffffff)); }
  for (let i = 0; i < GN; i++) Gh.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, rot: 0, life: 0 });
  let pi = 0, gi = 0;
  function puff(x, y, z, hex, n, spread, up) {
    for (let j = 0; j < n; j++) {
      const p = P[pi];
      p.x = x; p.y = y; p.z = z;
      p.vx = (Math.random() - 0.5) * spread; p.vz = (Math.random() - 0.5) * spread; p.vy = up * (0.6 + Math.random() * 0.6);
      p.life = p.max = 0.4 + Math.random() * 0.25;
      puffs.setColorAt(pi, tmpCol.set(hex).convertSRGBToLinear());
      pi = (pi + 1) % PN;
    }
  }
  return {
    kill(x, z, wet) {
      if (wet) { puff(x, 0.1, z, 0x7cc4f0, 5, 1.8, 4.5); puff(x, 0.1, z, 0xffffff, 3, 1.2, 5.5); return; }
      const g = Gh[gi]; gi = (gi + 1) % GN;
      g.x = x; g.y = 0.2; g.z = z; g.vx = (Math.random() - 0.5) * 5; g.vy = 7; g.rot = 0; g.life = 0.5;
      puff(x, 0.4, z, 0xffffff, 4, 2.2, 2.5);
    },
    clash(x, z, n) { puff(x, 0.5, z, 0xffffff, Math.min(n, 3), 2.6, 3); },
    update(dt) {
      for (let i = 0; i < PN; i++) {
        const p = P[i];
        if (p.life > 0) {
          p.life -= dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          dummy.position.set(p.x, Math.max(0.05, p.y), p.z); dummy.scale.setScalar(Math.max(0, p.life / p.max));
        } else dummy.scale.setScalar(0);
        dummy.updateMatrix(); puffs.setMatrixAt(i, dummy.matrix);
      }
      for (let i = 0; i < GN; i++) {
        const g = Gh[i];
        if (g.life > 0) {
          g.life -= dt; g.vy -= 16 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.rot += dt * 14;
          dummy.position.set(g.x, g.y, g.z); dummy.rotation.set(0, 0, g.rot); dummy.scale.setScalar(SIZE * Math.max(0, Math.min(1, g.life / 0.25)));
        } else dummy.scale.setScalar(0);
        dummy.updateMatrix(); ghosts.setMatrixAt(i, dummy.matrix);
      }
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      puffs.instanceMatrix.needsUpdate = ghosts.instanceMatrix.needsUpdate = true;
      puffs.instanceColor.needsUpdate = true;
    }
  };
})();
