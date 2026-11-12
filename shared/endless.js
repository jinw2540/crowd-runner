// One rules engine for the browser, Node tests and the server verifier. No DOM or Three.js.
(function (scope) {
'use strict';
const RULES = Object.freeze({ version: 'ice-run-1', hz: 60, startCount: 10, maxCount: 9999,
  chunk: 144000, bossEvery: 5, maxX: 4400, lateralStep: 150, inputBatch: 300, maxPending: 36000,
  startSpeed: 14000, maxSpeed: 20000, idleMs: 600000 });
const VALUES = [1, 10, 100, 1000], SCALES = [1, 1.75, 2.9, 4.6];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function dayAt(ms = Date.now()) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 10); }
function dailySeed(day) { return hash(RULES.version + ':' + day); }
function applyOp(count, gate) {
  const n = gate.op === '×' ? count * gate.v : gate.op === '÷' ? Math.ceil(count / gate.v)
    : gate.op === '−' ? count - gate.v : count + gate.v;
  return clamp(Math.floor(n), 1, RULES.maxCount);
}
function chunk(seed, index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('bad chunk');
  const random = rng(hash(seed + ':' + index + ':' + RULES.version)), start = index * RULES.chunk;
  const pressure = Math.min(8000, Math.round(12 * Math.pow(1.19, Math.min(index, 45))));
  const events = [], push = (kind, at, fields) => events.push({ id: index + ':' + events.length, chunk: index, kind, at: start + at * 1000, ...fields });
  const gate = at => {
    const amount = Math.max(3, Math.round(pressure * (.5 + random() * .6)));
    let a = { op: '+', v: amount, good: true }, b;
    if (index % 3 === 0 && at === 80) b = { op: '×', v: 2, good: true };
    else b = { op: '+', v: Math.max(2, Math.round(amount * (.65 + random() * .7))), good: true };
    if (a.op === b.op && a.v === b.v) b.v++;
    if (random() < .5) [a, b] = [b, a];
    push('gate', at, { left: a, right: b });
  };
  gate(24);
  push('hazard', 48, { type: index < 2 ? 'pit' : ['pit', 'slider', 'spinner'][Math.floor(random() * 3)], side: random() < .5 ? -1 : 1, phase: Math.floor(random() * 240) });
  gate(80);
  if ((index + 1) % RULES.bossEvery === 0) push('enemy', 120, { size: Math.min(9500, Math.round(pressure * 2.2)), boss: true });
  else if (index % 2) push('enemy', 120, { size: Math.max(2, Math.round(pressure * .65)), boss: false });
  else gate(120);
  return { index, start, end: start + RULES.chunk, events, hasHazard: true };
}
// Quantized logical formation. Cosmetic wobble/merge animation never enters collision calculations.
function formation(count) {
  const units = []; let area = 0, i = 0;
  for (let tier = 3; tier >= 0; tier--) {
    const n = tier === 3 ? Math.floor(count / 1000) : Math.floor(count / VALUES[tier]) % 10;
    const fr = .28 * SCALES[tier];
    for (let j = 0; j < n; j++) {
      const r = i ? 1.85 * Math.sqrt(area + fr * fr * .5) : 0, angle = i * 2.39996;
      units.push({ tier, index: j, x: Math.round(Math.cos(angle) * r * 1000), z: Math.round(Math.sin(angle) * r * 1000), radius: Math.round(fr * 1000), value: VALUES[tier] });
      area += fr * fr; i++;
    }
  }
  return units;
}
// Integer triangular motion avoids client/server trigonometric differences at collision boundaries.
function triangle(tick, period) { const p = ((tick % period) + period) % period; return p < period / 2 ? -1000 + p * 4000 / period : 3000 - p * 4000 / period; }
const DIRECTIONS = [[1000,0],[966,259],[866,500],[707,707],[500,866],[259,966],[0,1000],[-259,966],[-500,866],[-707,707],[-866,500],[-966,259],[-1000,0],[-966,-259],[-866,-500],[-707,-707],[-500,-866],[-259,-966],[0,-1000],[259,-966],[500,-866],[707,-707],[866,-500],[966,-259]];
function hazardPose(event, tick) {
  if (event.type === 'slider') return { x: Math.round(triangle(tick + event.phase, 240) * 2.7), angle: 0, c: 1000, s: 0 };
  const angle = event.type === 'spinner' ? Math.floor((tick + event.phase) / 6) % 24 : 0;
  return { x: event.side * (event.type === 'pit' ? 2750 : 2200), angle: angle * Math.PI / 12, c: DIRECTIONS[angle][0], s: DIRECTIONS[angle][1] };
}
function hazardLoss(count, x, event, tick) {
  const pose = hazardPose(event, tick); let loss = 0;
  for (const u of formation(count)) {
    const edge = Math.min(4750, 5000 - Math.round(u.radius * .6));
    const dx = clamp(x + u.x, -edge, edge) - pose.x, radius = Math.round(u.radius * .7);
    // A single contact line per obstacle: each logical unit can lose value only once.
    const hit = event.type === 'spinner'
      ? Math.abs(dx * pose.c) < (3300 + radius) * 1000 && Math.abs(dx * pose.s) < (600 + radius) * 1000
      : Math.abs(dx) < (event.type === 'pit' ? 2250 : 2200) + radius;
    if (hit) loss += u.tier ? Math.ceil(u.value * .3) : 1;
  }
  return Math.min(count, loss);
}
function create(seed, version = RULES.version) {
  if (version !== RULES.version || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('unsupported rules');
  return { version, seed, tick: 0, distance: 0, travelRemainder: 0, x: 0, count: RULES.startCount,
    maxCount: RULES.startCount, bosses: 0, clean: 0, chunkIndex: 0, eventIndex: 0, damaged: false,
    fight: null, finished: false, reason: '', score: 0 };
}
function score(s) { return Math.floor(s.distance / 1000) * 10 + s.bosses * 500 + s.clean * 200; }
function step(s, target, notify = () => {}) {
  if (s.finished) return s;
  if (!Number.isInteger(target) || Math.abs(target) > RULES.maxX) throw new Error('invalid input');
  s.tick++; s.x += clamp(target - s.x, -RULES.lateralStep, RULES.lateralStep);
  if (s.fight) {
    const f = s.fight; f.elapsed++;
    const expected = Math.min(f.exchange, Math.floor(f.exchange * f.elapsed / f.duration));
    const loss = expected - f.lost;
    if (loss) { s.count -= loss; f.remaining -= loss; f.lost = expected; notify({ type: 'hit', event: f.event, lost: loss, remaining: f.remaining }); }
    if (s.count <= 0) { s.finished = true; s.reason = '게 무리가 더 많았어요'; }
    else if (f.remaining <= 0) {
      if (f.event.boss) s.bosses++;
      notify({ type: 'victory', event: f.event }); s.fight = null;
    }
  } else {
    const speed = Math.min(RULES.maxSpeed, RULES.startSpeed + Math.floor(s.distance / 720000) * 450);
    s.travelRemainder += speed; const travel = Math.floor(s.travelRemainder / RULES.hz);
    s.travelRemainder %= RULES.hz; s.distance += travel;
    const current = chunk(s.seed, s.chunkIndex);
    while (s.eventIndex < current.events.length && s.distance >= current.events[s.eventIndex].at) {
      const e = current.events[s.eventIndex++];
      if (e.kind === 'gate') { const pick = s.x < 0 ? e.left : e.right; s.count = applyOp(s.count, pick); notify({ type: 'gate', event: e, pick }); }
      else if (e.kind === 'hazard') {
        const loss = hazardLoss(s.count, s.x, e, s.tick); s.count -= loss; s.damaged ||= loss > 0;
        notify({ type: 'hazard', event: e, lost: loss });
        if (!s.count) { s.finished = true; s.reason = '얼음길에서 모두 흩어졌어요'; }
      } else {
        s.distance = e.at; s.travelRemainder = 0;
        s.fight = { event: e, remaining: e.size, exchange: Math.min(s.count, e.size), lost: 0, elapsed: 0, duration: e.boss ? 90 : 48 };
        notify({ type: 'battle', event: e }); break;
      }
      if (s.finished) break;
    }
    if (!s.finished && !s.fight && s.distance >= current.end) {
      if (current.hasHazard && !s.damaged) { s.clean++; notify({ type: 'clean', chunk: current.index }); }
      s.chunkIndex++; s.eventIndex = 0; s.damaged = false;
    }
  }
  s.maxCount = Math.max(s.maxCount, s.count); s.score = score(s); return s;
}
function replay(state, inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > RULES.inputBatch) throw new Error('invalid batch size');
  const s = JSON.parse(JSON.stringify(state));
  for (const input of inputs) { if (s.finished) throw new Error('input after finish'); step(s, input); }
  return s;
}
// Rendering can run at any refresh rate; queued real time always advances the same fixed ticks.
function clock() {
  let debt = 0;
  return { reset() { debt = 0; }, advance(seconds, fn) {
    debt += seconds; if (debt > 2) { debt = 0; return false; }
    while (debt + 1e-9 >= 1 / RULES.hz) { debt -= 1 / RULES.hz; if (fn() === false) { debt = 0; break; } }
    return true;
  }, get alpha() { return Math.max(0, debt * RULES.hz); } };
}
const API = Object.freeze({ RULES, VALUES, SCALES, rng, hash, dayAt, dailySeed, applyOp, chunk, formation, hazardPose, hazardLoss, create, step, score, replay, clock });
scope.EndlessCore = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(globalThis);
