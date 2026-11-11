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
const tmpV = new THREE.Vector3();
const SCARVES = [0xffc21a, 0xff5a5f, 0x2fd0a8, 0xff8fc7].map(h => new THREE.Color(h).convertSRGBToLinear());
const shadowGeo = new THREE.CircleGeometry(0.27, 12); shadowGeo.rotateX(-Math.PI / 2);

/* Ten of a kind merge into one of the next size up, so a crowd is drawn as the digits of its count:
   347 is three captains, four big ones and seven little ones. The count itself is unchanged. */
const TIER_VALUE = [1, 10, 100, 1000];
const TIER_SCALE = [1, 1.75, 2.9, 4.6];
const MAX_TOP = 30;      // most of the largest size drawn at once
const UNIT_CAP = 120;    // instances per mesh, including ones still animating out
const LAYOUT_K = 1.85;   // how loosely the formation is packed

// Headgear is built with its base at y = 0 and placed on the head each frame.
const BEANIE = (() => {   // big penguins (10): knitted hat in the scarf's colour
  const dome = new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.95, 1);
  return merge([tint(dome, SNOW), ball(0.205, 1, 0.2, 1, 0, 0.01, 0, GREY, 10), ball(0.07, 1, 1, 1, 0, 0.22, 0, SNOW, 8)]);
})();
const CROWN = (() => {    // captains (100) and emperors (1000)
  const parts = [], band = new THREE.CylinderGeometry(0.15, 0.13, 0.09, 10); band.translate(0, 0.045, 0);
  parts.push(tint(band, 0xffc21a));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * 6.283, sp = new THREE.ConeGeometry(0.04, 0.11, 5);
    sp.translate(Math.cos(a) * 0.125, 0.14, Math.sin(a) * 0.125);
    parts.push(tint(sp, 0xffc21a), ball(0.022, 1, 1, 1, Math.cos(a) * 0.15, 0.045, Math.sin(a) * 0.15, 0xe5383b, 5));
  }
  return merge(parts);
})();
const CAPE = (() => {     // emperors only
  const g = new THREE.ConeGeometry(0.23, 0.46, 8); g.scale(1, 1, 0.3); g.translate(0, -0.23, 0.19);
  return tint(g, 0xd7263d);
})();
const ANCHOR = {
  penguin: { beanie: [0.765, 0], crown: [0.8, 0], cape: [0.53, 0] },
  crab: { crown: [0.3, -0.07] }
};

class CrowdView {
  constructor(kind) {
    this.kind = kind; this.crab = kind === 'crab';
    this.cx = 0; this.cz = 0; this.hop = 1;
    this.mode = null;                 // 'run' | 'idle' | 'cheer'; null falls back to hop
    this.tilt = 0; this.tiltT = 0;    // lean into steering
    this.arms = 0; this.armsT = 0;    // wings or claws raised
    this.jump = 0; this.flinch = 0;   // one-shot reactions, 1 -> 0
    this.value = 0;
    this.tiers = [[], [], [], []];    // live units by size
    this.leaving = [];                // units shrinking away or flying into a merge
    this.r = 0.3; this.tall = 1;
    this.group = new THREE.Group();
    const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    const mk = (geo, material) => {
      const m = new THREE.InstancedMesh(geo, material || mat(), UNIT_CAP);
      m.frustumCulled = false; m.count = 0; m.userData.crowd = true; m.castShadow = true;
      this.group.add(m);
      return m;
    };
    const M = MODELS[kind];
    this.body = mk(M.body); this.limbs = mk(M.limbs);
    this.shadow = mk(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x0a2a4a, transparent: true, opacity: 0.2, depthWrite: false }));
    this.shadow.castShadow = false;
    this.scarf = M.scarf ? mk(M.scarf) : null;
    this.beanie = this.crab ? null : mk(BEANIE);
    this.crown = mk(CROWN);
    this.cape = this.crab ? null : mk(CAPE);
    for (const m of [this.scarf, this.beanie]) if (m) for (let i = 0; i < UNIT_CAP; i++) m.setColorAt(i, SCARVES[0]);
  }
  get radius() { return this.r; }
  footprint(tier) { return 0.28 * TIER_SCALE[tier] * (this.crab ? 1.2 : 1); }
  compose(n) {
    n = Math.max(0, Math.floor(n));
    return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10, Math.min(MAX_TOP, Math.floor(n / 1000))];
  }
  // Redraw the crowd for a new count. opts.instant skips the animation; opts.prefer names a unit to break up first.
  setValue(n, opts) {
    opts = opts || {};
    const want = this.compose(n), removed = [], added = [];
    for (let t = 0; t < 4; t++) {
      const list = this.tiers[t];
      while (list.length > want[t]) {
        const at = opts.prefer && opts.prefer.tier === t ? list.indexOf(opts.prefer) : -1;
        removed.push(at >= 0 ? list.splice(at, 1)[0] : list.pop());
      }
    }
    for (let t = 3; t >= 0; t--) {
      const list = this.tiers[t];
      while (list.length < want[t]) {
        let x, z, delay = 0;
        const bigger = removed.find(u => u.tier > t), smaller = removed.filter(u => u.tier < t);
        const a = Math.random() * 6.283;
        if (bigger) {               // split: burst out of the larger one that broke up
          const d = Math.random() * this.footprint(bigger.tier);
          x = bigger.ox + Math.cos(a) * d; z = bigger.oz + Math.sin(a) * d;
        } else if (smaller.length) { // merge: appear where the smaller ones gather
          x = 0; z = 0;
          for (const u of smaller) { x += u.ox / smaller.length; z += u.oz / smaller.length; }
          delay = 0.2;
        } else { x = Math.cos(a) * 0.3; z = Math.sin(a) * 0.3; }
        const u = {
          tier: t, ox: x, oz: z, tx: x, tz: z, wx: 0, wz: 0, fr: this.footprint(t),
          ph: Math.random() * 6.283, sc: opts.instant ? 1 : 0.15 - delay * 5,
          sz: t ? 0.95 + Math.random() * 0.1 : 0.84 + Math.random() * 0.36,
          scarf: Math.floor(Math.random() * SCARVES.length)
        };
        list.push(u); added.push(u);
      }
    }
    if (!opts.instant) {
      for (const u of removed) this.leaving.push({ u, t: 0, into: added.find(q => q.tier > u.tier) || null });
      while (this.leaving.length > 40) this.leaving.shift();
    }
    this.value = n;
    if (opts.instant) this.snap();
  }
  killUnit(u) { const list = this.tiers[u.tier], i = list.indexOf(u); if (i >= 0) list.splice(i, 1); }
  eachUnit(cb) { for (const list of this.tiers) for (const u of list.slice()) cb(u); }
  // Largest in the middle, smaller ones spiralling outwards; spacing follows each unit's footprint.
  layout() {
    let acc = 0, i = 0, far = 0.3, tall = 0;
    for (let t = 3; t >= 0; t--) for (const u of this.tiers[t]) {
      const fr = u.fr, r = i ? LAYOUT_K * Math.sqrt(acc + fr * fr * 0.5) : 0, a = i * 2.39996;
      u.tx = Math.cos(a) * r; u.tz = Math.sin(a) * r;
      acc += fr * fr; i++;
      far = Math.max(far, r + fr);
      tall = Math.max(tall, (this.crab ? 0.5 : 0.9) * TIER_SCALE[t] * SIZE);
    }
    this.r = far; this.tall = tall || 1;
  }
  snap() {
    this.layout();
    for (const list of this.tiers) for (const u of list) { u.ox = u.tx; u.oz = u.tz; u.sc = 1; }
    this.leaving.length = 0;
  }
  update(dt, t) {
    this.layout();
    this.tilt += (this.tiltT - this.tilt) * Math.min(1, dt * 9);
    this.arms += (this.armsT - this.arms) * Math.min(1, dt * 8);
    this.jump = Math.max(0, this.jump - dt / 0.42);
    this.flinch = Math.max(0, this.flinch - dt / 0.45);
    this._mode = this.mode || (this.hop >= 1 ? 'run' : 'idle');
    this._jumpY = this.jump > 0 ? Math.sin((1 - this.jump) * Math.PI) * 0.7 : 0;
    this._n = 0; this._beanies = 0; this._crowns = 0; this._capes = 0;
    const k = 1 - Math.exp(-dt * 7);
    for (const list of this.tiers) for (const u of list) {
      u.ox += (u.tx - u.ox) * k; u.oz += (u.tz - u.oz) * k;
      u.sc = Math.min(1, u.sc + dt * 5);
      this.draw(u, Math.max(0, u.sc), t);
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i], u = l.u;
      l.t += dt / 0.24;
      if (l.t >= 1) { this.leaving.splice(i, 1); continue; }
      if (l.into) { const p = Math.min(1, dt * 14); u.ox += (l.into.ox - u.ox) * p; u.oz += (l.into.oz - u.oz) * p; }
      this.draw(u, 1 - l.t, t);
    }
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    const flush = (m, n) => { if (!m) return; m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    flush(this.body, this._n); flush(this.limbs, this._n); flush(this.shadow, this._n); flush(this.scarf, this._n);
    flush(this.beanie, this._beanies); flush(this.crown, this._crowns); flush(this.cape, this._capes);
    this.shadow.visible = !Q.shadows;
  }
  // Write one unit into the instanced meshes. grow is 0..1 for popping in and shrinking away.
  draw(u, grow, t) {
    const i = this._n;
    if (i >= UNIT_CAP) return;
    const crab = this.crab, tier = u.tier, arms = this.arms, flinch = this.flinch, hop = this.hop, ph = u.ph;
    const scale = SIZE * TIER_SCALE[tier] * u.sz, size = grow * scale * (1 - flinch * 0.18);
    const beat = 10 / (1 + tier * 0.3);   // bigger ones move more slowly
    // st is vertical stretch: below 1 squashes on landing, above 1 stretches in the air
    let y = 0, rx = 0, ry = 0, rz = 0, st = 1, side = 0, flap = 0;
    if (this._mode === 'run') {
      const w = Math.sin(t * beat + ph), up = Math.abs(w);
      flap = 0.5 + 0.5 * Math.sin(t * beat * 2 + ph * 3);
      if (crab) { side = w * 0.09; y = up * 0.05; st = 1 + (up - 0.5) * 0.16; rz = w * 0.08; }
      else { y = up * 0.1; st = 1 + (up - 0.5) * 0.22; rz = w * 0.2 - this.tilt * 0.32; rx = -0.2 + flinch * 0.5; }
    } else if (this._mode === 'cheer') {
      const up = Math.abs(Math.sin(t * 7 / (1 + tier * 0.2) + ph));
      y = up * 0.55; st = 1 + (up - 0.4) * 0.28; ry = t * 5 / (1 + tier * 0.4) + ph; flap = 1;
    } else {
      st = 1 + Math.sin(t * 2.2 + ph) * 0.035;
      ry = Math.sin(t * 0.7 + ph * 2) * (crab ? 0.2 : 0.55);
      if (Math.sin(t * 0.9 + ph * 1.7) > 0.85) flap = 0.5 + 0.5 * Math.sin(t * 26);
    }
    if (this._jumpY > 0) { y += this._jumpY * (0.8 + (ph % 1) * 0.4); st += this._jumpY * 0.25; }
    const wide = 1 / Math.sqrt(st), edge = Math.min(W - 0.25, Math.max(0.25, W - u.fr * 0.6));
    const x = u.wx = clamp(this.cx + u.ox, -edge, edge) + side * scale / SIZE, z = u.wz = this.cz + u.oz, yy = y * scale;
    dummy.position.set(x, yy, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(size * wide, size * st, size * wide);
    dummy.updateMatrix();
    this.body.setMatrixAt(i, dummy.matrix);
    if (this.scarf) { this.scarf.setMatrixAt(i, dummy.matrix); this.scarf.setColorAt(i, SCARVES[u.scarf]); }
    // Headgear follows the head through the body's tilt and spin
    const A = ANCHOR[this.kind];
    const wear = (mesh, anchor, n) => {
      tmpV.set(0, anchor[0], anchor[1]).applyMatrix4(dummy.matrix);
      const px = dummy.position.x, py = dummy.position.y, pz = dummy.position.z;
      dummy.position.copy(tmpV); dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      dummy.position.set(px, py, pz); dummy.updateMatrix();
    };
    if (tier === 1 && this.beanie) { this.beanie.setColorAt(this._beanies, SCARVES[u.scarf]); wear(this.beanie, A.beanie, this._beanies++); }
    if (tier >= 2) wear(this.crown, A.crown, this._crowns++);
    if (tier === 3 && this.cape) wear(this.cape, A.cape, this._capes++);
    // Wings spread and lift; claws pinch and reach up.
    if (crab) dummy.scale.set(size * wide, size * st * (1 + flap * 0.35 + arms * 0.3), size * wide);
    else { dummy.scale.set(size * wide * (1 + flap * 0.3 + arms * 0.4), size * st, size * wide); dummy.position.y = yy + arms * 0.14 * size; }
    dummy.updateMatrix();
    this.limbs.setMatrixAt(i, dummy.matrix);
    const sh = size * (crab ? 1.3 : 1) * Math.max(0.4, 1 - y * 0.8);
    dummy.position.set(x, 0.045, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sh, 1, sh);
    dummy.updateMatrix();
    this.shadow.setMatrixAt(i, dummy.matrix);
    this._n = i + 1;
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
