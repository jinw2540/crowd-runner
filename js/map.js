// Stars and the expedition map screen.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Stars and the expedition map ---------- */
// Stars compare survivors with the most that the best route could keep after the boss.
function starsFor(count, lv) {
  const r = count / Math.max(1, lv.best - lv.boss);
  return r >= 0.75 ? 3 : r >= 0.4 ? 2 : 1;
}
const earned = n => n < Save.data.level ? (Save.data.stars[n] || 1) : 0;
function drawStars(el, n) {
  el.textContent = '';
  el.setAttribute('aria-label', '별 ' + n + '개');
  for (let i = 0; i < 3; i++) { const s = document.createElement('i'); s.textContent = '★'; if (i >= n) s.className = 'off'; el.appendChild(s); }
}
const ZONES = ['유빙 해안', '빙하 계곡', '눈보라 고원', '오로라 설원'];
function zoneName(n) {
  const k = Math.floor((n - 1) / 10);
  return ZONES[k % 4] + (k >= 4 ? ' ' + (Math.floor(k / 4) + 1) + '차' : '');
}
const ROW = 92, ZGAP = 46, PADT = 130, PADB = 300;
const NS = 'http://www.w3.org/2000/svg';
let mapSel = 1, mapH = 0, mapPts = [], mapSvg = null, mapPeng = null, mapNodeArt = [], walkRaf = 0, walkTimer = 0;
const stageY = i => mapH - PADB - (i - 0.5) * ROW - (Math.floor((i - 1) / 10) + 1) * ZGAP;
function sv(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const at = (parent, x, y, sc) => sv('g', { transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${sc || 1})` }, parent);
// Irregular outline for a slab of ice
function blob(r, rx, ry, n, jit) {
  let out = ''; const off = r() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = off + i / n * 6.283, k = 1 - jit / 2 + r() * jit;
    out += (Math.cos(a) * rx * k).toFixed(1) + ',' + (Math.sin(a) * ry * k).toFixed(1) + ' ';
  }
  return out;
}
const DECOR = {
  floe(g, r) {
    const pts = blob(r, 26, 13, 8, 0.4);
    sv('polygon', { points: pts, fill: 'rgba(12,52,98,.35)', transform: 'translate(0,7)' }, g);
    sv('polygon', { points: pts, fill: '#63cbdc', transform: 'translate(0,3)' }, g);
    sv('polygon', { points: pts, fill: '#f4fbff' }, g);
  },
  seal(g) {
    sv('ellipse', { cx: 0, cy: 7, rx: 17, ry: 6, fill: 'rgba(255,255,255,.16)', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1.5 }, g);
    const h = sv('g', { class: 'bobber' }, g);
    sv('ellipse', { cx: 0, cy: -2, rx: 9, ry: 10, fill: '#8d9bb0' }, h);
    sv('ellipse', { cx: 0, cy: 2, rx: 6, ry: 4, fill: '#bcc7d6' }, h);
    sv('circle', { cx: -3.5, cy: -4, r: 1.4, fill: '#1c2541' }, h);
    sv('circle', { cx: 3.5, cy: -4, r: 1.4, fill: '#1c2541' }, h);
    sv('circle', { cx: 0, cy: 0.6, r: 1.3, fill: '#1c2541' }, h);
  },
  berg(g) {
    sv('ellipse', { cx: 0, cy: 6, rx: 36, ry: 9, fill: 'rgba(255,255,255,.22)' }, g);
    sv('polygon', { points: '-26,4 28,4 23,10 -21,10', fill: '#63cbdc' }, g);
    sv('polygon', { points: '-26,4 -12,-22 0,-48 10,-26 28,4', fill: '#eef9ff' }, g);
    sv('polygon', { points: '0,-48 10,-26 28,4 6,4', fill: '#b5d9f0' }, g);
  },
  berg2(g) {
    sv('ellipse', { cx: 0, cy: 6, rx: 42, ry: 9, fill: 'rgba(255,255,255,.22)' }, g);
    sv('polygon', { points: '-34,4 34,4 29,10 -29,10', fill: '#63cbdc' }, g);
    sv('polygon', { points: '-34,4 -20,-18 -2,-26 14,-14 34,4', fill: '#eef9ff' }, g);
    sv('polygon', { points: '-2,-26 14,-14 34,4 8,4', fill: '#b5d9f0' }, g);
  },
  ridge(g) {
    sv('ellipse', { cx: 0, cy: 6, rx: 48, ry: 9, fill: 'rgba(255,255,255,.5)' }, g);
    sv('polygon', { points: '-40,6 -12,-36 2,-18 16,-32 42,6', fill: '#7f9bd0' }, g);
    sv('polygon', { points: '16,-32 42,6 12,6 2,-18', fill: '#6582bd' }, g);
    sv('polygon', { points: '-12,-36 -22,-21 -15,-25 -9,-19 -2,-24', fill: '#ffffff' }, g);
    sv('polygon', { points: '16,-32 8,-21 14,-24 20,-18 24,-21', fill: '#ffffff' }, g);
  },
  drift(g) { sv('path', { d: 'M-30,4 Q-12,-12 4,0 Q16,-9 30,4 Z', fill: 'rgba(255,255,255,.78)' }, g); }
};
const ZONE_DECOR = [['floe', 'floe', 'seal', 'berg2'], ['berg', 'berg', 'berg2', 'floe'], ['ridge', 'ridge', 'drift', 'berg'], ['ridge', 'berg', 'floe', 'drift']];

function drawNodeArt(g, i, state) {
  const r = mulberry32(i * 131 + 9), base = i % 10 === 0, rx = base ? 48 : 35, ry = base ? 38 : 29;
  const pts = blob(r, rx, ry, 10, 0.22);
  sv('polygon', { points: pts, fill: 'rgba(10,40,85,.4)', transform: 'translate(0,9)' }, g);
  sv('polygon', { points: pts, fill: state === 'cur' ? '#d9a400' : state === 'lock' ? '#8fb0d6' : '#63cbdc', transform: 'translate(0,4)' }, g);
  sv('polygon', { points: pts, fill: state === 'cur' ? '#ffd23f' : state === 'lock' ? '#c3d8ee' : '#f8fdff' }, g);
  if (state === 'lock') {
    g.setAttribute('opacity', '.85');
    sv('ellipse', { cx: -rx * 0.45, cy: -ry * 0.5, rx: 13, ry: 6, fill: '#ffffff' }, g);
    sv('ellipse', { cx: rx * 0.5, cy: ry * 0.35, rx: 11, ry: 5, fill: '#ffffff' }, g);
  }
  if (base) {
    // Camp at the end of each zone: igloo and flag
    const ig = at(g, rx * 0.5, -ry * 0.62);
    sv('path', { d: 'M-14,0 A14,14 0 0 1 14,0 Z', fill: '#ffffff', stroke: '#b4d4ea', 'stroke-width': 1.5 }, ig);
    sv('path', { d: 'M-12,-6 H12 M-7,-11 H7 M-4,0 V-6 M5,-6 V-11 M-9,0 V-6', stroke: '#b4d4ea', 'stroke-width': 1.2, fill: 'none' }, ig);
    sv('path', { d: 'M-4,0 v-5 a4,4 0 0 1 8,0 v5 z', fill: '#1c2541' }, ig);
    const fl = at(g, -rx * 0.6, -ry * 0.45);
    sv('line', { x1: 0, y1: 0, x2: 0, y2: -24, stroke: '#1c2541', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, fl);
    sv('polygon', { points: '0,-24 14,-20 0,-15', fill: '#e5383b' }, fl);
  }
}
function drawPenguin(parent) {
  const outer = sv('g', { id: 'mapPeng' }, parent), g = sv('g', { class: 'pg-w' }, outer);
  sv('ellipse', { cx: -5, cy: -1, rx: 4.6, ry: 2.3, fill: '#ffc21a' }, g);
  sv('ellipse', { cx: 5, cy: -1, rx: 4.6, ry: 2.3, fill: '#ffc21a' }, g);
  sv('ellipse', { cx: -11.5, cy: -15, rx: 3.2, ry: 8, fill: '#1f3478', transform: 'rotate(14 -11.5 -15)' }, g);
  sv('ellipse', { cx: 11.5, cy: -15, rx: 3.2, ry: 8, fill: '#1f3478', transform: 'rotate(-14 11.5 -15)' }, g);
  sv('ellipse', { cx: 0, cy: -15, rx: 12, ry: 14, fill: '#27408b' }, g);
  sv('ellipse', { cx: 0, cy: -13, rx: 8, ry: 10.5, fill: '#ffffff' }, g);
  sv('circle', { cx: 0, cy: -31, r: 9.5, fill: '#27408b' }, g);
  sv('ellipse', { cx: 0, cy: -30, rx: 6.6, ry: 6, fill: '#ffffff' }, g);
  sv('circle', { cx: -5, cy: -28.3, r: 1.6, fill: '#ff9db5' }, g);
  sv('circle', { cx: 5, cy: -28.3, r: 1.6, fill: '#ff9db5' }, g);
  sv('circle', { cx: -2.8, cy: -32, r: 1.3, fill: '#10162e' }, g);
  sv('circle', { cx: 2.8, cy: -32, r: 1.3, fill: '#10162e' }, g);
  sv('polygon', { points: '-2.6,-29.6 2.6,-29.6 0,-26', fill: '#ff9f1c' }, g);
  sv('rect', { x: -9.5, y: -24.6, width: 19, height: 4.6, rx: 2.2, fill: '#e5383b' }, g);
  sv('rect', { x: 4, y: -22.5, width: 4.6, height: 9.5, rx: 2, fill: '#e5383b' }, g);
  return outer;
}
const pengAt = (x, y) => mapPeng.setAttribute('transform', `translate(${x.toFixed(1)},${(y - 20).toFixed(1)}) scale(1.25)`);

function renderMap() {
  cancelAnimationFrame(walkRaf); clearTimeout(walkTimer);
  const d = Save.data, N = d.level + 4, trail = $('mapTrail'), w = trail.clientWidth;
  const zones = Math.floor((N - 1) / 10) + 1;
  mapH = PADT + PADB + N * ROW + zones * ZGAP;
  trail.style.height = mapH + 'px';
  trail.textContent = '';
  const svg = mapSvg = sv('svg', { width: w, height: mapH, 'aria-hidden': 'true' }, trail), defs = sv('defs', {}, svg);
  const amp = Math.min(w, 520) * 0.3, pts = mapPts = [];
  for (let i = 1; i <= N; i++) pts.push([w / 2 + Math.sin(i * 1.1) * amp, stageY(i)]);
  const zoneBottom = k => k === 0 ? mapH : stageY(k * 10 + 1) + ROW / 2 + ZGAP;

  // Sea whose colour shifts from zone to zone, with a faint ripple pattern
  const css = getComputedStyle(document.documentElement);
  const grad = sv('linearGradient', { id: 'mapSea', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: mapH }, defs);
  for (let k = zones - 1; k >= 0; k--) {
    const top = k === zones - 1 ? 0 : zoneBottom(k + 1), col = css.getPropertyValue('--sea-' + (k % 4 + 1)).trim();
    sv('stop', { offset: ((top + 45) / mapH).toFixed(4), 'stop-color': col }, grad);
    sv('stop', { offset: ((zoneBottom(k) - 45) / mapH).toFixed(4), 'stop-color': col }, grad);
  }
  const pat = sv('pattern', { id: 'mapWave', width: 64, height: 30, patternUnits: 'userSpaceOnUse' }, defs);
  sv('path', { d: 'M4,10 q7,-6 14,0 t14,0 M36,25 q6,-5 12,0 t12,0', fill: 'none', stroke: 'rgba(255,255,255,.13)', 'stroke-width': 2, 'stroke-linecap': 'round' }, pat);
  sv('feGaussianBlur', { stdDeviation: 10 }, sv('filter', { id: 'mapBlur', x: '-20%', y: '-80%', width: '140%', height: '260%' }, defs));
  sv('rect', { width: w, height: mapH, fill: 'url(#mapSea)' }, svg);
  sv('rect', { width: w, height: mapH, fill: 'url(#mapWave)' }, svg);

  // Sky effects per zone: snowfall on the plateau, aurora and stars on the last zone
  const sky = sv('g', {}, svg);
  for (let k = 0; k < zones; k++) {
    const top = k === zones - 1 ? 0 : zoneBottom(k + 1), bottom = zoneBottom(k), r = mulberry32(k * 53 + 3), kind = k % 4;
    if (kind === 2) for (let j = 0; j < 46; j++) sv('circle', { cx: (r() * w).toFixed(0), cy: (top + r() * (bottom - top)).toFixed(0), r: (1 + r() * 1.6).toFixed(1), fill: 'rgba(255,255,255,.6)' }, sky);
    if (kind === 3) {
      for (let j = 0; j < 3; j++) {
        const y = top + (j + 0.6) / 3.2 * (bottom - top), g = sv('g', { class: 'aur', style: `animation-delay:${-j * 1.7}s` }, sky);
        const dd = `M${-40},${y} C${w * 0.3},${y - 70} ${w * 0.62},${y + 60} ${w + 40},${y - 30}`;
        sv('path', { d: dd, fill: 'none', stroke: '#62efae', 'stroke-width': 46, opacity: .3, filter: 'url(#mapBlur)' }, g);
        sv('path', { d: dd, fill: 'none', stroke: '#ff8fd0', 'stroke-width': 20, opacity: .28, filter: 'url(#mapBlur)', transform: 'translate(0,26)' }, g);
      }
      for (let j = 0; j < 60; j++) sv('circle', { cx: (r() * w).toFixed(0), cy: (top + r() * (bottom - top)).toFixed(0), r: (0.7 + r() * 1.3).toFixed(1), fill: '#ffffff', opacity: (0.5 + r() * 0.5).toFixed(2), class: j % 4 ? '' : 'tw' }, sky);
    }
  }

  // Scenery beside the trail, kept clear of the path and the stage floes
  const deco = sv('g', {}, svg);
  for (let i = 1; i <= N; i++) {
    const r = mulberry32(i * 977 + 5), kinds = ZONE_DECOR[Math.floor((i - 1) / 10) % 4], px = pts[i - 1][0];
    // Keep clear of the zone signpost that sits between stage 10 and stage 11 of each zone
    const y = stageY(i) + (r() - 0.5) * 30 + (i % 10 === 1 ? -24 : i % 10 === 0 ? 30 : 0);
    const sides = [[26, px - 84], [px + 84, w - 26]].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
    const count = w > 760 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const lo = sides[c][0], hi = sides[c][1];
      if (hi - lo < 44) continue;
      const kind = kinds[Math.floor(r() * kinds.length)];
      DECOR[kind](at(deco, lo + r() * (hi - lo), y + (c ? (r() - 0.5) * 36 : 0), 0.8 + r() * 0.55), r);
    }
    if (w > 1000) for (const side of [-1, 1]) {
      const kind = kinds[Math.floor(r() * kinds.length)];
      DECOR[kind](at(deco, w / 2 + side * (330 + r() * (w / 2 - 370)), y + (r() - 0.5) * 60, 0.9 + r() * 0.7), r);
    }
  }

  // Trail: dotted ahead, a snow path with penguin footprints behind
  const line = upto => {
    let p = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < upto; i++) { const a = pts[i - 1], b = pts[i], m = ((a[1] + b[1]) / 2).toFixed(1); p += ` C${a[0].toFixed(1)},${m} ${b[0].toFixed(1)},${m} ${b[0].toFixed(1)},${b[1].toFixed(1)}`; }
    return p;
  };
  sv('path', { d: line(N), fill: 'none', stroke: 'rgba(255,248,231,.45)', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': '2 14' }, svg);
  if (d.level > 1) {
    sv('path', { d: line(d.level), fill: 'none', stroke: 'rgba(10,40,85,.3)', 'stroke-width': 17, 'stroke-linecap': 'round', transform: 'translate(0,4)' }, svg);
    const snow = sv('path', { d: line(d.level), fill: 'none', stroke: '#f4fbff', 'stroke-width': 15, 'stroke-linecap': 'round' }, svg);
    const len = snow.getTotalLength(), prints = sv('g', { stroke: '#8fb3d4', 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none' }, svg);
    for (let l = 14, n = 0; l < len - 8; l += 15, n++) {
      const p = snow.getPointAtLength(l), q = snow.getPointAtLength(l + 2);
      const ang = Math.atan2(q.y - p.y, q.x - p.x), off = n % 2 ? 3.6 : -3.6;
      sv('path', { d: 'M0,2 l-2.6,-4 M0,2 l0,-5 M0,2 l2.6,-4', transform: `translate(${(p.x - Math.sin(ang) * off).toFixed(1)},${(p.y + Math.cos(ang) * off).toFixed(1)}) rotate(${(ang * 180 / Math.PI + 90).toFixed(0)})` }, prints);
    }
  }

  // Stage floes (drawn in the picture) with a real button on top of each
  mapNodeArt = [];
  const art = sv('g', {}, svg);
  for (let i = 1; i <= N; i++) {
    const g = at(art, pts[i - 1][0], pts[i - 1][1]), inner = sv('g', {}, g);
    drawNodeArt(inner, i, i < d.level ? 'done' : i === d.level ? 'cur' : 'lock');
    mapNodeArt.push(inner);
  }
  // The goal of the whole trek
  const pole = at(svg, w / 2, 96);
  sv('ellipse', { cx: 0, cy: 2, rx: 30, ry: 8, fill: 'rgba(255,255,255,.8)' }, pole);
  sv('rect', { x: -3, y: -44, width: 6, height: 46, rx: 2, fill: '#ffffff' }, pole);
  for (let j = 0; j < 4; j++) sv('rect', { x: -3, y: -40 + j * 11, width: 6, height: 5, fill: '#e5383b' }, pole);
  sv('circle', { cx: 0, cy: -48, r: 6, fill: '#ffd23f', stroke: '#d9a400', 'stroke-width': 1.5 }, pole);
  const label = sv('text', { x: 0, y: -62, 'text-anchor': 'middle', fill: '#fff8e7', 'font-size': 18, style: 'font-family:var(--font-display)' }, pole);
  label.textContent = '남극점';
  mapPeng = drawPenguin(svg);
  pengAt(pts[d.level - 1][0], pts[d.level - 1][1]);

  let total = 0;
  for (let k = 0; k < zones; k++) {
    const first = k * 10 + 1;
    let got = 0;
    for (let i = first; i < first + 10; i++) got += earned(i);
    total += got;
    const name = document.createElement('div'), b = document.createElement('b');
    name.className = 'zone-name';
    name.textContent = zoneName(first);
    b.textContent = '★ ' + got + '/30';
    name.appendChild(b);
    name.style.top = (stageY(first) + ROW / 2 + ZGAP / 2 + 2) + 'px';
    trail.appendChild(name);
  }
  const chip = $('mapStars'), star = document.createElement('span');
  chip.textContent = ''; star.className = 'star'; star.textContent = '★ ';
  chip.append(star, String(total));
  chip.setAttribute('aria-label', '모은 별 ' + total + '개');

  for (let i = 1; i <= N; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'node' + (i === d.level ? ' cur' : '') + (i === mapSel ? ' sel' : '');
    b.id = 'node' + i;
    b.style.left = pts[i - 1][0] + 'px'; b.style.top = pts[i - 1][1] + 'px';
    b.textContent = i;
    if (i > d.level) { b.disabled = true; b.setAttribute('aria-label', '스테이지 ' + i + ', 잠김'); }
    else {
      b.setAttribute('aria-label', '스테이지 ' + i);
      b.addEventListener('click', () => selectStage(i));
      if (i < d.level) { const st = document.createElement('span'); st.className = 'st'; drawStars(st, earned(i)); b.appendChild(st); }
    }
    trail.appendChild(b);
  }
}
// After a first clear, the penguin walks along the trail from the stage just beaten to the newly opened one.
function walkPenguin(from, to) {
  const a = mapPts[from - 1], b = mapPts[to - 1];
  if (!a || !b || calm) return;
  pengAt(a[0], a[1]);
  walkTimer = setTimeout(() => {
    const m = (a[1] + b[1]) / 2;
    const seg = sv('path', { d: `M${a[0]},${a[1]} C${a[0]},${m} ${b[0]},${m} ${b[0]},${b[1]}`, fill: 'none' }, mapSvg);
    const len = seg.getTotalLength(), t0 = performance.now();
    const tick = now => {
      const u = Math.min(1, (now - t0) / 1300), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const p = seg.getPointAtLength(len * e);
      pengAt(p.x, p.y);
      if (u < 1) walkRaf = requestAnimationFrame(tick);
      else { seg.remove(); if (mapNodeArt[to - 1]) mapNodeArt[to - 1].classList.add('pop'); }
    };
    walkRaf = requestAnimationFrame(tick);
  }, 350);
}
function selectStage(n) {
  const d = Save.data, prev = $('node' + mapSel), cur = $('node' + n);
  if (prev) prev.classList.remove('sel');
  if (cur) cur.classList.add('sel');
  mapSel = n;
  const lv = genLevel(n), done = n < d.level;
  $('sTitle').textContent = '스테이지 ' + n;
  $('sZone').textContent = zoneName(n);
  drawStars($('sStars'), earned(n));
  const best = $('sBest');
  best.textContent = '';
  if (d.best[n]) { best.append('최고 기록 '); const b = document.createElement('b'); b.textContent = d.best[n].toLocaleString('ko-KR') + '명'; best.append(b, ' 생존'); }
  else best.textContent = done ? '클리어한 스테이지예요.' : '아직 기록이 없어요. 보스 무리는 ' + lv.boss.toLocaleString('ko-KR') + '마리예요.';
  const has = t => lv.segs.some(q => q.type === t || q.kind === t);
  const feats = [['spinner', '고드름 막대'], ['pit', '얼음 구멍'], ['slider', '얼음 벽'], ['enemy', '게 무리']].filter(f => has(f[0]));
  const box = $('sFeats');
  box.textContent = '';
  for (const f of feats.length ? feats : [['', '게이트만 나와요']]) { const c = document.createElement('span'); c.textContent = f[1]; box.appendChild(c); }
  $('sNote').hidden = !done;
}
function openMap(walkFrom) {
  toMenu();
  $('menu').hidden = true; $('map').hidden = false;
  mapSel = Save.data.level;
  renderMap(); selectStage(mapSel);
  const sc = $('mapScroll');
  sc.scrollTop = stageY(mapSel) - (sc.clientHeight - 230) / 2;
  if (walkFrom && walkFrom === mapSel - 1) walkPenguin(walkFrom, mapSel);
}
function playStage(n) { G.stage = clamp(n, 1, Save.data.level); startRun(true); }
