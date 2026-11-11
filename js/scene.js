// Everything placed in the world: ice road, icebergs, gates, hazards, igloo, sea, mountains, snow.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function gateTex(g) {
  return canvasTex(256, 164, (ctx, w, h) => {
    ctx.fillStyle = g.good ? 'rgba(47,155,255,.8)' : 'rgba(255,84,70,.8)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,248,231,.9)'; ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.font = "104px Jua, 'Noto Sans KR', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff8e7';
    ctx.fillText(g.op + g.v, w / 2, h / 2 + 8, w - 30);
  });
}

/* ---------- Level objects ---------- */
let level = null, levelGroup = null, gates = [], foes = [], hazards = [];
const SEA_Y = -1.4;
const C = hex => new THREE.Color(hex).convertSRGBToLinear();
const lam = (hex, flat) => new THREE.MeshLambertMaterial({ color: C(hex), flatShading: !!flat });
// Glossy faceted ice with a cool rim light on edges facing away from the viewer.
function iceMat() {
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: C(0x8fc4e6) });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>',
      'outgoingLight += vec3(0.5, 0.78, 1.0) * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0) * 0.38;\n#include <output_fragment>');
  };
  return m;
}
function hash3(x, y, z) {
  const v = Math.sin(Math.round(x * 40) * 12.9898 + Math.round(y * 40) * 78.233 + Math.round(z * 40) * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
// Roughen a basic shape: push vertices in and out, then colour each flat face with paint(centreY, normalY, random).
function sculpt(g, amtXZ, amtY, seed, paint, shape) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash3(x + seed, y, z) - 0.5) * amtXZ;
    x *= k; z *= k; y *= 1 + (hash3(x, y + seed, z) - 0.5) * amtY;
    if (shape) { const o = shape(x, y, z); x = o[0]; y = o[1]; z = o[2]; }
    p.setXYZ(i, x, y, z);
  }
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  g.computeBoundingBox();
  const q = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(q.count * 3), c = new THREE.Color();
  for (let i = 0; i < q.count; i += 3) {
    const cy = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3;
    c.copy(C(paint(cy, nrm.getY(i), hash3(q.getX(i), cy + seed, q.getZ(i + 1)))));
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const ICE_SIDE = [0xd6eefa, 0xbfe3f6, 0xa6d6f1], TEAL = 0x63cbdc;
const icePaint = water => (cy, ny, r) => cy < water ? TEAL : ny > 0.55 ? 0xffffff : ICE_SIDE[Math.floor(r * 3)];
// Three iceberg shapes: lumpy, tapered towards the top, flat at the waterline, snow on upward faces.
const BERGS = [3.1, 7.7, 12.3].map(seed => {
  const g = sculpt(new THREE.SphereGeometry(1, 7, 5), 0.75, 0.5, seed, icePaint(-0.02),
    (x, y, z) => { const t = 1 - 0.38 * Math.max(0, y); return [x * t, y > 0 ? y * 1.7 : y * 0.22, z * t]; });
  g.translate(0, 0.2, 0);
  return g;
});
const FLOE = sculpt(new THREE.CylinderGeometry(1, 1.1, 0.5, 9), 0.4, 0, 5.5, icePaint(-0.05));
const ICE_TINTS = [0xffffff, 0xf0f9fe, 0xdcf0fb];
const SHARED = new Set([...BERGS, FLOE]);
const SNOWMAN = merge([
  ball(0.75, 1, 0.9, 1, 0, 0.62, 0, SNOW, 12), ball(0.52, 1, 0.95, 1, 0, 1.55, 0, SNOW, 12), ball(0.36, 1, 1, 1, 0, 2.25, 0, SNOW, 12),
  ball(0.4, 1, 0.25, 1, 0, 1.97, 0, CRAB, 10), cone(0.07, 0.36, Math.PI / 2, 0, 2.25, 0.46, BEAK),
  ball(0.05, 1, 1, 1, -0.13, 2.37, 0.31, 0x10162e, 6), ball(0.05, 1, 1, 1, 0.13, 2.37, 0.31, 0x10162e, 6),
  ball(0.06, 1, 1, 1, 0, 1.7, 0.5, 0x10162e, 6), ball(0.06, 1, 1, 1, 0, 1.4, 0.5, 0x10162e, 6),
  ...[-1, 1].flatMap(sd => {
    const arm = new THREE.CylinderGeometry(0.035, 0.045, 0.85, 5); arm.rotateZ(sd * -1.05); arm.translate(sd * 0.82, 1.78, 0);
    const twig = new THREE.CylinderGeometry(0.025, 0.03, 0.3, 5); twig.rotateZ(sd * -0.2); twig.translate(sd * 1.02, 2.05, 0);
    return [tint(arm, 0x6b4a2b), tint(twig, 0x6b4a2b)];
  }),
  (() => { const hat = new THREE.CylinderGeometry(0.22, 0.28, 0.32, 10); hat.translate(0, 2.7, 0); return tint(hat, 0x1c2541); })(),
  (() => { const brim = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12); brim.translate(0, 2.56, 0); return tint(brim, 0x1c2541); })()
]);
SHARED.add(SNOWMAN);
let foamTex = null;
// One cloth shape shared by every flag; its vertices are rippled each frame so all flags wave in the same wind.
const FLAG_GEO = new THREE.PlaneGeometry(0.95, 0.52, 7, 1); FLAG_GEO.translate(0.475, 0, 0);
SHARED.add(FLAG_GEO);
function waveFlags(t) {
  const p = FLAG_GEO.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 7 - t * 9) * 0.14 * x); }
  p.needsUpdate = true;
  FLAG_GEO.computeVertexNormals();
}

function disposeLevel() {
  if (!levelGroup) return;
  levelGroup.traverse(o => {
    if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  scene.remove(levelGroup);
}
function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
  m.position.set(x, y, z);
  return m;
}
function flag(x, y, z, dir) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, y, 6), lam(0x1c2541));
  pole.position.y = y / 2;
  const cloth = new THREE.Mesh(FLAG_GEO, new THREE.MeshLambertMaterial({ color: C(0xe5383b), side: THREE.DoubleSide }));
  cloth.position.y = y - 0.3; cloth.scale.x = dir;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lam(0xffc21a));
  knob.position.y = y + 0.05;
  g.add(pole, cloth, knob);
  g.position.set(x, 0, z);
  return g;
}
// Draw n instances; place(i, dummy) positions each one and returns its tint.
function scatter(geo, mat, n, place) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  for (let i = 0; i < n; i++) {
    const tint = place(i, dummy);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    m.setColorAt(i, tmpCol.copy(C(tint)));
  }
  dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
  m.frustumCulled = false;
  levelGroup.add(m);
  return m;
}

function buildLevel() {
  disposeLevel();
  levelGroup = new THREE.Group(); scene.add(levelGroup);
  gates = []; foes = []; hazards = [];
  level = genLevel(G.stage);
  const L = -level.bossZ + 50, midZ = -L / 2 + 20, dr = mulberry32(level.level * 31 + 7);
  const pickTint = () => ICE_TINTS[Math.floor(dr() * ICE_TINTS.length)];
  const flat = m => { m.userData.ground = true; return m; };

  // The road is a long ice floe: glossy cracked ice on top, a teal ledge at the waterline, foam where it meets the sea
  const roadTex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cfe9f7'; ctx.fillRect(0, 0, w, h);
    const r = mulberry32(99);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 20 + r() * 40, 8 + r() * 14, r() * 3, 0, 6.3); ctx.fill(); }
    ctx.strokeStyle = '#9fcfe8'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    for (let i = 0; i < 7; i++) {
      let x = r() * w, y = r() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(1, L / 10);
  const road = flat(new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L),
    new THREE.MeshPhongMaterial({ map: roadTex, shininess: 90, specular: C(0x2a4f6c) })));
  road.rotation.x = -Math.PI / 2; road.position.z = midZ;
  levelGroup.add(road);
  levelGroup.add(box(W * 2 + 2, 1.4, L, 0xbfe3f6, 0, -0.71, midZ), box(W * 2 + 3.2, 0.5, L, TEAL, 0, SEA_Y - 0.08, midZ));
  levelGroup.add(box(1, 0.3, L, 0xffffff, -W - 0.5, 0.08, midZ), box(1, 0.3, L, 0xffffff, W + 0.5, 0.08, midZ));
  foamTex = canvasTex(64, 128, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      const reach = w * (0.55 + 0.25 * Math.sin(y / h * 6.283 * 2) + 0.12 * Math.sin(y / h * 6.283 * 5));
      const gr = ctx.createLinearGradient(0, 0, reach, 0);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.5, 'rgba(235,250,255,.55)'); gr.addColorStop(1, 'rgba(235,250,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, y, reach, 1);
    }
  });
  foamTex.wrapT = THREE.RepeatWrapping; foamTex.repeat.set(1, L / 9);
  for (const side of [-1, 1]) {
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.2, L), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.scale.x = side;
    foam.position.set(side * (W + 1.6 + 1.1), SEA_Y + 0.05, midZ);
    foam.material.side = THREE.DoubleSide;
    levelGroup.add(foam);
  }
  const lumps = Math.floor(L / 2.4) * 2;
  scatter(new THREE.SphereGeometry(0.6, 7, 5), lam(0xffffff, true), lumps, (i, d) => {
    d.rotation.set(0, dr() * 6.283, 0);
    d.position.set((i % 2 ? 1 : -1) * (W + 0.5 + (dr() - 0.5) * 0.3), 0.15, 20 - Math.floor(i / 2) * 2.4 - dr());
    d.scale.set(0.8 + dr() * 0.7, 0.5 + dr() * 0.5, 0.8 + dr() * 0.9);
    return 0xffffff;
  });

  // Icebergs and flat floes drifting on the sea, each with foam and a glow of submerged ice around it
  const spots = [];
  const bergs = Math.floor(L / 6), per = Math.ceil(bergs / BERGS.length);
  BERGS.forEach((geo, gi) => scatter(geo, iceMat(), per, (i, d) => {
    const n = i * BERGS.length + gi, sc = 2 + dr() * 6, sz = sc * (0.7 + dr() * 0.6);
    d.rotation.set(0, dr() * 6.283, 0);
    d.position.set((n % 2 ? 1 : -1) * (10 + Math.max(sc, sz) * 1.5 + dr() * 44), SEA_Y - 0.1, 30 - (n / bergs) * (L + 50));
    d.scale.set(sc, sc * (0.6 + dr() * 0.9), sz);
    spots.push([d.position.x, d.position.z, Math.max(sc, sz) * 1.5]);
    return pickTint();
  }));
  const floes = Math.floor(L / 5);
  scatter(FLOE, iceMat(), floes, (i, d) => {
    const sx = 1.2 + dr() * 3.5, sz = 1.2 + dr() * 3.5;
    d.rotation.set(0, dr() * 6.283, 0);
    d.position.set((i % 2 ? 1 : -1) * (9.5 + dr() * 42), SEA_Y + 0.12, 30 - (i / floes) * (L + 50));
    d.scale.set(sx, 1, sz);
    spots.push([d.position.x, d.position.z, Math.max(sx, sz) * 1.55]);
    return pickTint();
  });
  const haloTex = canvasTex(128, 128, (ctx, w) => {
    const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(110,215,228,.75)'); gr.addColorStop(0.6, 'rgba(110,215,228,.6)');
    gr.addColorStop(0.74, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w);
  });
  const haloGeo = new THREE.CircleGeometry(1, 20); haloGeo.rotateX(-Math.PI / 2);
  scatter(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false }), spots.length, (i, d) => {
    d.rotation.set(0, 0, 0);
    d.position.set(spots[i][0], SEA_Y + 0.03 + (i % 5) * 0.002, spots[i][1]);
    d.scale.set(spots[i][2], 1, spots[i][2]);
    return 0xffffff;
  });

  // Snowmen watching from their own floes
  const men = Math.max(2, Math.floor(L / 45));
  for (let i = 0; i < men; i++) {
    const side = i % 2 ? 1 : -1, x = side * (W + 4.6), z = -(22 + i * 45 + dr() * 14);
    const base = new THREE.Mesh(sculpt(new THREE.CylinderGeometry(2.4, 2.7, 1.4, 9), 0.25, 0, i + 1.5, icePaint(-0.45)), iceMat());
    base.position.set(x, -0.71, z);
    const man = new THREE.Mesh(SNOWMAN, new THREE.MeshLambertMaterial({ vertexColors: true }));
    man.position.set(x, 0, z); man.rotation.y = -side * 0.7;
    levelGroup.add(base, man);
  }

  for (const s of level.segs) {
    if (s.kind === 'gate') {
      const mk = (g, x) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 3),
          new THREE.MeshBasicMaterial({ map: gateTex(g), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        m.position.set(x, 1.9, s.z);
        levelGroup.add(m);
        return { g, mesh: m };
      };
      const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8), lam(0x1c2541));
      mid.position.set(0, 1.75, s.z);
      levelGroup.add(mid, flag(-W, 4.1, s.z, -1), flag(W, 4.1, s.z, 1));
      gates.push({ z: s.z, left: mk(s.left, -W / 2), right: mk(s.right, W / 2), done: false });
    } else if (s.kind === 'enemy') {
      addFoe(s.x, s.z, s.size, 110, false);
    } else {
      const h = { type: s.type, z: s.z, side: s.side, ang: 0, x: 0 };
      h.mesh = new THREE.Group();
      if (s.type === 'spinner') {
        // Spinning bar of icicles
        h.x = s.side * 2.2;
        h.mesh.add(box(6.4, 0.42, 0.42, 0x2b7bbd, 0, 0.5, 0));
        for (let k = -3; k <= 3; k++) for (const d of [-1, 1]) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.6, 6), lam(0xffffff, true));
          spike.rotation.x = d * Math.PI / 2; spike.position.set(k * 0.95, 0.5, d * 0.45);
          h.mesh.add(spike);
        }
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1, 12), lam(0x1c2541));
        pole.position.y = 0.5;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam(0xe5383b));
        knob.position.y = 1.1;
        h.mesh.add(pole, knob);
        h.mesh.position.set(h.x, 0, s.z);
      } else if (s.type === 'slider') {
        // Sliding block of rough blue ice with snow on top
        const geo = sculpt(new THREE.BoxGeometry(4, 1.4, 0.85, 5, 2, 1), 0.07, 0.1, 2.2,
          (cy, ny, r) => ny > 0.5 ? 0xffffff : [0x3f9fe0, 0x58b0ea, 0x2f8dd2][Math.floor(r * 3)]);
        const block = new THREE.Mesh(geo, iceMat());
        block.position.y = 0.72;
        h.mesh.add(block);
        h.mesh.position.set(0, 0, s.z);
      } else {
        // Hole in the ice: open water on one side of the road
        h.x = s.side * 2.75;
        // Shallow teal shelf around dark open water, ringed by broken slabs of ice with a few pieces afloat
        const shelf = flat(new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.1), new THREE.MeshBasicMaterial({ color: C(TEAL) })));
        shelf.rotation.x = -Math.PI / 2; shelf.position.y = 0.016;
        const hole = flat(new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.3), new THREE.MeshBasicMaterial({ color: C(0x0d4675) })));
        hole.rotation.x = -Math.PI / 2; hole.position.y = 0.022;
        h.mesh.add(shelf, hole);
        const slab = (x, z, big) => {
          const m = box((big ? 0.55 : 0.3) + dr() * 0.55, 0.1 + dr() * 0.12, (big ? 0.3 : 0.25) + dr() * 0.3, dr() < 0.5 ? 0xffffff : 0xd6eefa, x, big ? 0.07 : 0.05, z);
          m.rotation.set((dr() - 0.5) * 0.3, dr() * 3.14, (dr() - 0.5) * 0.3);
          h.mesh.add(m);
        };
        for (let k = 0; k < 24; k++) {
          const u = (k % 6 + 0.5) / 6 * 2 - 1, edge = Math.floor(k / 6), j = (dr() - 0.5) * 0.22;
          if (edge < 2) slab(u * 2.3, (edge ? 2.08 : -2.08) + j, true); else slab((edge === 2 ? 2.33 : -2.33) + j, u * 2.05, true);
        }
        for (let k = 0; k < 4; k++) slab((dr() - 0.5) * 3, (dr() - 0.5) * 2.5, false);
        h.mesh.position.set(h.x, 0, s.z);
      }
      levelGroup.add(h.mesh);
      hazards.push(h);
    }
  }

  // Finish: a wide round floe for the boss group, with an igloo camp behind it
  const pad = flat(new THREE.Mesh(sculpt(new THREE.CylinderGeometry(9, 9.7, 1.4, 14), 0.1, 0, 8.8, icePaint(-0.45)), iceMat()));
  pad.position.set(0, -0.68, level.bossZ);
  const brick = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b4d4ea'; ctx.lineWidth = 4;
    const rows = 6, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(w, r * rh); ctx.stroke();
      const n = 16 - r * 2, bw = w / n;
      for (let k = 0; k < n; k++) { const x = (k + (r % 2) * 0.5) * bw; ctx.beginPath(); ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh); ctx.stroke(); }
    }
  });
  const igloo = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: brick }));
  igloo.position.set(0, 0, level.bossZ - 14);
  const tunnelGeo = new THREE.CylinderGeometry(1.25, 1.25, 2.6, 16, 1, true); tunnelGeo.rotateX(Math.PI / 2);
  const tunnel = new THREE.Mesh(tunnelGeo, new THREE.MeshLambertMaterial({ map: brick.clone() }));
  tunnel.material.map.needsUpdate = true;
  tunnel.position.set(0, 0, level.bossZ - 10.1);
  const door = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), new THREE.MeshBasicMaterial({ color: C(0x16203f) }));
  door.position.set(0, 0, level.bossZ - 8.79);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 6, 18), lam(0xe6f4fc));
  lip.position.set(0, 0, level.bossZ - 8.8);
  levelGroup.add(pad, igloo, tunnel, door, lip, flag(4.2, 4.6, level.bossZ - 12, 1));
  addFoe(0, level.bossZ, level.boss, 150, true);

  // Shadows: flat ground only receives, see-through things do neither, everything else does both
  levelGroup.traverse(o => {
    if (!o.isMesh || o.userData.crowd || o.material.transparent) return;
    o.receiveShadow = true;
    if (!o.userData.ground) o.castShadow = true;
  });
}

/* ---------- Scenery that follows the camera: sea, snowy mountains, falling snow ---------- */
const farGroup = new THREE.Group(); scene.add(farGroup);
// Tileable wave strokes: every stroke is drawn nine times so it wraps cleanly at the edges
function waves(ctx, w, n, seed, styles, width) {
  const r = mulberry32(seed);
  ctx.lineCap = 'round'; ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * w, len = 18 + r() * 46, bend = (r() - 0.5) * 14;
    ctx.strokeStyle = styles[i % styles.length];
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath(); ctx.moveTo(x + ox * w, y + oy * w);
      ctx.quadraticCurveTo(x + ox * w + len / 2, y + oy * w + bend, x + ox * w + len, y + oy * w);
      ctx.stroke();
    }
  }
}
const SEA = 700, SEA_REP = 46, SHINE_REP = 29;
const seaTex = canvasTex(256, 256, (ctx, w) => {
  ctx.fillStyle = '#16659e'; ctx.fillRect(0, 0, w, w);
  waves(ctx, w, 46, 11, ['rgba(92,170,222,.5)', 'rgba(9,66,116,.45)', 'rgba(60,140,200,.4)'], 3.5);
});
const shineTex = canvasTex(256, 256, (ctx, w) => waves(ctx, w, 30, 23, ['rgba(255,255,255,.55)', 'rgba(200,236,255,.4)'], 1.6));
seaTex.wrapS = seaTex.wrapT = shineTex.wrapS = shineTex.wrapT = THREE.RepeatWrapping;
seaTex.repeat.set(SEA_REP, SEA_REP); shineTex.repeat.set(SHINE_REP, SHINE_REP);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(SEA, SEA), new THREE.MeshPhongMaterial({ map: seaTex, shininess: 120, specular: C(0x6f9fc4) }));
sea.rotation.x = -Math.PI / 2; sea.position.set(0, SEA_Y, -150); sea.receiveShadow = true;
const shine = new THREE.Mesh(new THREE.PlaneGeometry(SEA, SEA), new THREE.MeshBasicMaterial({ map: shineTex, transparent: true, depthWrite: false }));
shine.rotation.x = -Math.PI / 2; shine.position.set(0, SEA_Y + 0.015, -150);
farGroup.add(sea, shine);
{
  let g = new THREE.ConeGeometry(1, 1, 6, 1); g.translate(0, 0.5, 0); g = g.toNonIndexed();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), top = C(0xffffff), low = C(0xa9cfe9);
  for (let i = 0; i < n; i++) { const c = g.attributes.position.getY(i) > 0.5 ? top : low; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const N = 30, r = mulberry32(4242);
  const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }), N);
  for (let i = 0; i < N; i++) {
    dummy.position.set(-300 + i * 20.7 + r() * 8, SEA_Y, -185 - r() * 35);
    dummy.rotation.set(0, r() * 6.283, 0);
    dummy.scale.set(20 + r() * 20, 14 + r() * 30, 20 + r() * 20);
    dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
  }
  dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
  m.frustumCulled = false;
  farGroup.add(m);
}
const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLAKES = calm ? 0 : 260, flakePos = new Float32Array(FLAKES * 3);
for (let i = 0; i < FLAKES; i++) { flakePos[i * 3] = (Math.random() - 0.5) * 44; flakePos[i * 3 + 1] = Math.random() * 16; flakePos[i * 3 + 2] = -50 + Math.random() * 56; }
const flakeGeo = new THREE.BufferGeometry();
flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
flakes.frustumCulled = false;
farGroup.add(flakes);
function updateFar(dt, z, t, moving) {
  farGroup.position.z = z;
  // The sea sheet travels with the camera; shifting its texture the other way keeps the waves fixed in the world while they drift.
  const drift = calm ? 0 : t;
  seaTex.offset.set(drift * 0.012, -SEA_REP * z / SEA + drift * 0.02);
  shineTex.offset.set(-drift * 0.02, -SHINE_REP * z / SEA - drift * 0.03);
  if (foamTex) foamTex.offset.y = drift * 0.04;
  waveFlags(drift);
  sun.target.position.set(0, 0, z - 24);
  sun.position.set(22, 40, z - 54);
  sun.target.updateMatrixWorld();
  for (let i = 0; i < FLAKES; i++) {
    const o = i * 3;
    flakePos[o] += Math.sin(t + i) * 0.4 * dt;
    flakePos[o + 1] -= (1.4 + (i % 5) * 0.35) * dt;
    flakePos[o + 2] += (moving ? 7 : 1) * dt;
    if (flakePos[o + 1] < 0) flakePos[o + 1] = 16;
    if (flakePos[o + 2] > 6) flakePos[o + 2] = -50;
  }
  if (FLAKES) flakeGeo.attributes.position.needsUpdate = true;
}

function addFoe(x, z, size, max, isBoss) {
  const view = new CrowdView('crab');
  view.cx = x; view.cz = z; view.hop = 0.25;
  view.setValue(size, { instant: true });
  levelGroup.add(view.group);
  foes.push({ size, view, isBoss, dead: false, acc: 0, rate: 0 });
}
