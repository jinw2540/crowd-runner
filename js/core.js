// Shared helpers and constants, saved progress, and stage generation.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

const $ = id => document.getElementById(id);
const fail = () => { $('fail').hidden = false; $('menu').hidden = true; };
if (!window.THREE) { fail(); throw new Error('Three.js could not be loaded'); }

const W = 5;            // road half width
const SPEED = 14;       // forward units per second
const MAXU = 150;       // max drawn units in the player's crowd
const SPACING = 0.5;
const SIZE = 1.4;       // character scale
const SEG = 24;         // distance between level segments
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Save ---------- */
const Save = {
  key: 'mungchyeo-run-v1',
  data: { level: 1, coins: 0, upStart: 0, upIncome: 0, muted: false, stars: {}, best: {} },
  load() {
    try {
      const r = JSON.parse(localStorage.getItem(this.key));
      if (r && typeof r === 'object') {
        for (const k of Object.keys(this.data)) if (r[k] !== null && typeof r[k] === typeof this.data[k]) this.data[k] = r[k];
      }
    } catch (e) { /* storage unavailable: play without saving */ }
  },
  store() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
};
Save.load();

/* ---------- Level generation ---------- */
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function applyOp(n, g) {
  switch (g.op) {
    case '+': return n + g.v;
    case '×': return n * g.v;
    case '−': return Math.max(1, n - g.v);
    default: return Math.max(1, Math.ceil(n / g.v));
  }
}
const nice = n => n > 40 ? Math.round(n / 10) * 10 : n > 15 ? Math.round(n / 5) * 5 : Math.round(n);

function genLevel(level) {
  const rnd = mulberry32(level * 7919 + 13);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const rf = (a, b) => a + rnd() * (b - a);
  const n = Math.min(5 + Math.floor(level * 0.8), 14);
  const kinds = [];
  if (level >= 2) kinds.push('spinner');
  if (level >= 3) kinds.push('pit');
  if (level >= 5) kinds.push('slider');
  const segs = [];
  let best = 1, mults = 0, tripled = false, last = '';
  const good = () => {
    if (mults < 4 && best >= 3 && best < 300 && rnd() < 0.45) {
      mults++;
      if (!tripled && rnd() < 0.2) { tripled = true; return { op: '×', v: 3, good: true }; }
      return { op: '×', v: 2, good: true };
    }
    return { op: '+', v: Math.max(2, nice(best * rf(0.4, 1.4) + ri(1, 4))), good: true };
  };
  const bad = () => rnd() < 0.6
    ? { op: '−', v: Math.max(1, nice(best * rf(0.2, 0.6))), good: false }
    : { op: '÷', v: 2, good: false };

  for (let i = 0; i < n; i++) {
    let kind = 'gate';
    const r = rnd();
    if (i > 0 && i < n - 1) {
      if (r < 0.25 && best >= 6 && last !== 'enemy') kind = 'enemy';
      else if (r >= 0.25 && r < 0.5 && kinds.length && best >= 4 && last === 'gate') kind = 'hazard';
    }
    const z = -(30 + i * SEG);
    if (kind === 'gate') {
      const a = good();
      let b = rnd() < 0.45 ? good() : bad();
      if (a.op === b.op && a.v === b.v) b = bad();
      best = Math.max(applyOp(best, a), applyOp(best, b));
      const flip = rnd() < 0.5;
      segs.push({ kind, z, left: flip ? b : a, right: flip ? a : b });
    } else if (kind === 'enemy') {
      const size = Math.max(1, Math.round(best * rf(0.25, 0.5)));
      best -= size;
      segs.push({ kind, z, size, x: rf(-2, 2) });
    } else {
      best = Math.max(1, Math.floor(best * 0.9));
      segs.push({ kind, z, type: kinds[ri(0, kinds.length - 1)], side: rnd() < 0.5 ? -1 : 1 });
    }
    last = kind;
  }
  const ratio = 0.4 + Math.min(level, 20) * 0.015;
  return { level, segs, best, boss: Math.max(1, Math.floor(best * ratio)), bossZ: -(30 + n * SEG + 10) };
}
