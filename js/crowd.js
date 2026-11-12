// Penguin and crab models, crowd formation and animation, and particle effects.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Crowd ---------- */
// Shared scenery geometry helpers; characters are built by CharacterModels.
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
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color();
const shadowGeo = new THREE.CircleGeometry(0.27, 12); shadowGeo.rotateX(-Math.PI / 2);

/* Ten of a kind merge into one of the next size up, so a crowd is drawn as the digits of its count:
   347 is three captains, four big ones and seven little ones. The count itself is unchanged. */
const TIER_VALUE = [1, 10, 100, 1000];
const TIER_SCALE = [1, 1.75, 2.9, 4.6];
const MAX_TOP = 30;      // most of the largest size drawn at once
const UNIT_CAP = 120;    // instances per mesh, including ones still animating out
const LAYOUT_K = 1.85;   // how loosely the formation is packed

class CrowdView {
  constructor(kind) {
    this.kind = kind; this.crab = kind === 'crab';
    this.cx = 0; this.cz = 0; this.hop = 1;
    this.mode = null;                 // 'run' | 'idle' | 'cheer'; null falls back to hop
    this.tilt = 0; this.tiltT = 0;    // lean into steering
    this.arms = 0; this.armsT = 0;    // wings or claws raised
    this.jump = 0; this.flinch = 0;   // one-shot reactions, 1 -> 0
    this.front = null;                // while fighting: the point between the two crowds where they meet
    this.onContact = null;            // called as (x, z, unitScale) when a charging unit reaches that point
    this.victoryHop = 0;
    this.value = 0;
    this.tiers = [[], [], [], []];    // live units by size
    this.leaving = [];                // units shrinking away or flying into a merge
    this.r = 0.3; this.tall = 1;
    this.group = new THREE.Group();
    const animated = renderer.capabilities.vertexTextures &&
      (renderer.capabilities.isWebGL2 || renderer.extensions.has('OES_texture_float'));
    this.animated = animated;
    this.batches = [0, 1, 2, 3].map(tier => CharacterModels.batch(kind, tier, UNIT_CAP, animated));
    this.batches.forEach(batch => this.group.add(batch.mesh));
    this.shadow = new THREE.InstancedMesh(shadowGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x0a2a4a, transparent: true, opacity: 0.2, depthWrite: false }), UNIT_CAP);
    this.shadow.frustumCulled = false; this.shadow.count = 0; this.shadow.userData.crowd = true;
    this.group.add(this.shadow);
  }
  get radius() { return this.r; }
  celebrate() { this.victoryHop = 1; }
  resetFight() { this.front = null; this.victoryHop = 0; }
  // Index of the unit closest to the fighting line: those at the front fall first.
  nearest(list, p) {
    let best = -1, d = Infinity;
    list.forEach((u, i) => { const q = Math.hypot(this.cx + u.ox - p.x, this.cz + u.oz - p.z); if (q < d) { d = q; best = i; } });
    return best;
  }
  footprint(tier) { return 0.28 * TIER_SCALE[tier] * (this.crab ? 1.2 : 1); }
  compose(n) {
    n = Math.max(0, Math.floor(n));
    return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10, Math.min(MAX_TOP, Math.floor(n / 1000))];
  }
  // Redraw the crowd for a new count. opts.instant skips the animation; opts.prefer names a unit to break up first.
  setValue(n, opts) {
    opts = opts || {};
    const want = this.compose(n), removed = [], added = [], front = opts.instant ? null : this.front;
    for (let t = 0; t < 4; t++) {
      const list = this.tiers[t];
      while (list.length > want[t]) {
        let at = opts.prefer && opts.prefer.tier === t ? list.indexOf(opts.prefer) : -1;
        if (at < 0 && front) at = this.nearest(list, front);
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
          bigger.split = true;
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
          sz: t ? 0.95 + Math.random() * 0.1 : 0.84 + Math.random() * 0.36
        };
        list.push(u); added.push(u);
      }
    }
    if (!opts.instant) {
      let duels = 0;
      for (const l of this.leaving) if (l.duel) duels++;
      for (const u of removed) {
        const l = { u, t: 0, into: added.find(q => q.tier > u.tier) || null };
        // In a fight, one that falls first charges to the line, collides there and is knocked away.
        if (front && !l.into && !u.split && duels < 18) {
          const back = this.cz < front.z ? -1 : 1;
          duels++; l.duel = true; l.sx = u.ox; l.sz = u.oz;
          l.cx = this.cx; l.cz = this.cz;   // stays where the fight was, even if the crowd runs on
          l.tx = (front.x - this.cx) * 0.5 + u.ox * 0.5; l.tz = front.z - this.cz + back * u.fr * 0.55;
          l.vx = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 4); l.vz = back * (0.8 + Math.random() * 2.6);
          l.h = (1.1 + Math.random() * 0.9) * Math.sqrt(TIER_SCALE[u.tier]); l.spin = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
        }
        this.leaving.push(l);
      }
      while (this.leaving.length > 60) this.leaving.shift();
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
      tall = Math.max(tall, this.batches[t].asset.height * TIER_SCALE[t] * SIZE);
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
    this.victoryHop = Math.max(0, this.victoryHop - dt / .36);
    this._mode = this.mode || (this.hop >= 1 ? 'run' : 'idle');
    this._jumpY = this.jump > 0 ? Math.sin((1 - this.jump) * Math.PI) * 0.7 : 0;
    this._n = 0; this._counts = [0, 0, 0, 0];
    const animation = this._mode === 'cheer' ? 'cheer' : this.front ? 'fight' : this.arms > 0.5 ? 'wave' : this._mode;
    this.batches.forEach(batch => batch.update(dt, t, animation));
    const k = 1 - Math.exp(-dt * 7);
    for (const list of this.tiers) for (const u of list) {
      u.ox += (u.tx - u.ox) * k; u.oz += (u.tz - u.oz) * k;
      u.sc = Math.min(1, u.sc + dt * 5);
      this.draw(u, Math.max(0, u.sc), t);
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i], u = l.u;
      l.t += dt / (l.duel ? 0.64 : 0.24);
      if (l.t >= 1) { this.leaving.splice(i, 1); continue; }
      if (l.into) { const p = Math.min(1, dt * 14); u.ox += (l.into.ox - u.ox) * p; u.oz += (l.into.oz - u.oz) * p; }
      let grow = 1 - l.t;
      if (l.duel) {
        const CHARGE = 0.25;
        u.free = true;
        if (l.t < CHARGE) {
          const q = l.t / CHARGE, e = q * q;
          u.ox = l.sx + (l.tx - l.sx) * e + l.cx - this.cx; u.oz = l.sz + (l.tz - l.sz) * e + l.cz - this.cz;
          u.lean = q * 0.45; u.fy = 0; u.spin = 0; grow = 1;
        } else {
          if (!l.hit) { l.hit = true; if (this.onContact) this.onContact(l.cx + l.tx, l.cz + l.tz, TIER_SCALE[u.tier]); }
          const q = (l.t - CHARGE) / (1 - CHARGE), s = q * 0.48;
          u.ox = l.tx + l.vx * s + l.cx - this.cx; u.oz = l.tz + l.vz * s + l.cz - this.cz;
          u.lean = 0; u.fy = l.h * Math.sin(q * Math.PI * 0.82); u.spin = l.spin * s;
          grow = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        }
      }
      this.draw(u, grow, t);
    }
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    this.batches.forEach((batch, tier) => batch.flush(this._counts[tier]));
    this.shadow.count = this._n; this.shadow.instanceMatrix.needsUpdate = true;
    this.shadow.visible = !Q.shadows;
  }
  // Write one unit into the instanced meshes. grow is 0..1 for popping in and shrinking away.
  draw(u, grow, t) {
    const i = this._n;
    if (i >= UNIT_CAP) return;
    const crab = this.crab, tier = u.tier, flinch = this.flinch, ph = u.ph;
    const scale = SIZE * TIER_SCALE[tier] * u.sz, size = grow * scale * (1 - flinch * 0.18);
    // The authored rig supplies grounded steps and cloth motion. Only game reactions
    // (steering, cheering and hits) transform the complete character here.
    // fwd: the sign that pitches this character towards the way it faces.
    const fwd = crab ? 1 : -1;
    let y = 0, rx = flinch * 0.25, ry = 0, rz = 0, st = 1, dz = 0;
    if (this._mode === 'cheer') {
      const up = Math.abs(Math.sin(t * 7 / (1 + tier * 0.2) + ph));
      y = up * 0.4; st = 1 + (up - 0.4) * 0.12; ry = t * 2 / (1 + tier * 0.4) + ph;
    } else if (this.front) {
      // Everyone turns towards the middle of the line. The attack itself comes from the rig;
      // devices without animated rigs get a simple jab instead. Visual only: wx/wz stay put.
      ry = fwd * clamp((this.front.x - this.cx - u.ox) * 0.1, -0.45, 0.45);
      if (!this.animated) { const jab = Math.pow(Math.max(0, Math.sin(t * 9 + ph)), 4); dz = fwd * jab * 0.16 * scale; rx += fwd * jab * 0.2; }
    } else if (this._mode === 'run') rz = -this.tilt * 0.18;
    else ry = Math.sin(t * 0.7 + ph * 2) * (crab ? 0.1 : 0.2);
    if (u.lean) rx += fwd * u.lean;
    if (u.spin) rx += u.spin;
    if (this.victoryHop > 0) y += Math.sin((1 - this.victoryHop) * Math.PI) * .10;
    if (this._jumpY > 0) { y += this._jumpY * (0.8 + (ph % 1) * 0.4); st += this._jumpY * 0.25; }
    const wide = 1 / Math.sqrt(st), edge = Math.min(W - 0.25, Math.max(0.25, W - u.fr * 0.6));
    const x = u.wx = u.free ? this.cx + u.ox : clamp(this.cx + u.ox, -edge, edge), z = u.wz = this.cz + u.oz, yy = y * scale + (u.fy || 0);
    dummy.position.set(x, yy, z + dz);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(size * wide, size * st, size * wide);
    dummy.updateMatrix();
    const batch = this.batches[tier], slot = this._counts[tier]++;
    batch.mesh.setMatrixAt(slot, dummy.matrix);
    batch.phase.setX(slot, ph / (Math.PI * 2));
    const sh = size * (crab ? 1.3 : 1) * Math.max(0.25, 1 - y * 0.8 - (u.fy || 0) * 0.3);
    dummy.position.set(x, 0.045, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sh, 1, sh);
    dummy.updateMatrix();
    this.shadow.setMatrixAt(i, dummy.matrix);
    this._n = i + 1;
  }
}

/* ---------- Effects: snow puffs, splashes, and penguins bouncing away ---------- */
const Fx = (() => {
  const PN = 160, GN = 40, P = [], Gh = [];
  const puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), PN);
  // Little ones tumbling away: one instanced mesh for each kind of character.
  const ghosts = {};
  for (const kind of ['penguin', 'crab']) {
    const m = ghosts[kind] = new THREE.InstancedMesh(CharacterModels.get(kind, 0).still, new THREE.MeshLambertMaterial({ vertexColors: true }), GN);
    m.count = 0; m.frustumCulled = false; scene.add(m);
  }
  puffs.frustumCulled = false;
  scene.add(puffs);
  for (let i = 0; i < PN; i++) { P.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 }); puffs.setColorAt(i, tmpCol.set(0xffffff)); }
  for (let i = 0; i < GN; i++) Gh.push({ kind: 'penguin', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, life: 0 });
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
      g.kind = 'penguin'; g.x = x; g.y = 0.2; g.z = z; g.vx = (Math.random() - 0.5) * 5; g.vy = 7; g.vz = 0; g.rot = 0; g.life = 0.5;
      puff(x, 0.4, z, 0xffffff, 4, 2.2, 2.5);
    },
    // One knocked out of a brawl: up and back towards its own side (back is +1 or -1 along z).
    fling(kind, x, z, back) {
      const g = Gh[gi]; gi = (gi + 1) % GN;
      g.kind = kind; g.x = x; g.y = 0.3; g.z = z; g.rot = 0; g.life = 0.6;
      g.vx = (Math.random() - 0.5) * 9; g.vy = 6 + Math.random() * 3; g.vz = back * (1 + Math.random() * 3);
    },
    update(dt) {
      for (let i = 0; i < PN; i++) {
        const p = P[i];
        if (p.life > 0) {
          p.life -= dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          dummy.position.set(p.x, Math.max(0.05, p.y), p.z); dummy.scale.setScalar(Math.max(0, p.life / p.max));
        } else dummy.scale.setScalar(0);
        dummy.updateMatrix(); puffs.setMatrixAt(i, dummy.matrix);
      }
      const counts = { penguin: 0, crab: 0 };
      for (let i = 0; i < GN; i++) {
        const g = Gh[i];
        if (g.life > 0) {
          g.life -= dt; g.vy -= 16 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; g.rot += dt * 14;
          dummy.position.set(g.x, g.y, g.z); dummy.rotation.set(0, 0, g.rot); dummy.scale.setScalar(SIZE * Math.max(0, Math.min(1, g.life / 0.25)));
          dummy.updateMatrix(); ghosts[g.kind].setMatrixAt(counts[g.kind]++, dummy.matrix);
        }
      }
      for (const kind in ghosts) { ghosts[kind].count = counts[kind]; ghosts[kind].instanceMatrix.needsUpdate = true; }
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      puffs.instanceMatrix.needsUpdate = true;
      puffs.instanceColor.needsUpdate = true;
    }
  };
})();

