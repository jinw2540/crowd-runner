// Game state and flow, results and upgrades, simulation step, camera and frame loop.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Game state ---------- */
const G = { state: 'menu', stage: Save.data.level, nextStage: Save.data.level, count: 1, x: 0, lastX: 0, z: 0, t: 0, fight: null, bigHit: 0, short: 0, endTimer: 0, pending: null, walkFrom: 0 };
const player = new CrowdView('penguin');
scene.add(player.group);
const keys = { l: false, r: false };

const startCount = () => 1 + Save.data.upStart;
const incomeMult = () => 1 + 0.2 * Save.data.upIncome;
const costStart = () => Math.round(25 * Math.pow(1.45, Save.data.upStart));
const costIncome = () => Math.round(40 * Math.pow(1.5, Save.data.upIncome));

function sync() { player.setValue(G.count); }
function resetRun() {
  G.count = startCount(); G.x = 0; G.lastX = 0; G.z = 0; G.fight = null; G.pending = null;
  player.cx = 0; player.cz = 0; player.hop = 1; G.bigHit = 0; G.short = 0;
  player.setValue(G.count, { instant: true });
  camPos.set(0, 9, 12);
}
function refreshUI() {
  const d = Save.data;
  $('mStage').textContent = '스테이지 ' + d.level;
  $('hStage').textContent = '스테이지 ' + G.stage;
  $('mCoins').textContent = $('hCoins').textContent = $('mapCoins').textContent = d.coins.toLocaleString('ko-KR');
  $('upStartNow').textContent = startCount() + '명으로 출발';
  $('upStartCost').textContent = d.upStart >= 30 ? '최대' : '코인 ' + costStart();
  $('upStart').disabled = d.upStart >= 30 || d.coins < costStart();
  $('upIncomeNow').textContent = '보상 ' + Math.round(incomeMult() * 100) + '%';
  $('upIncomeCost').textContent = '코인 ' + costIncome();
  $('upIncome').disabled = d.coins < costIncome();
  $('mute').textContent = d.muted ? '소리 끔' : '소리 켬';
}
function toMenu() {
  G.stage = Save.data.level;
  buildLevel(); resetRun();
  G.state = 'menu';
  $('menu').hidden = false; $('hud').hidden = true; $('result').hidden = true; $('map').hidden = true;
  refreshUI();
}
function startRun(rebuild) {
  if (rebuild) { buildLevel(); resetRun(); }
  G.state = 'running';
  $('menu').hidden = true; $('hud').hidden = false; $('result').hidden = true; $('map').hidden = true;
  refreshUI();
}
// A result within this many of the boss's size counts as a close call
const closeCall = boss => Math.max(5, Math.round(boss * 0.15));
function finish(won, reason) {
  if (G.state !== 'running') return;
  const d = Save.data;
  let gain;
  if (won) {
    const replay = G.stage < d.level, st = starsFor(G.count, level);
    gain = Math.round((20 + G.stage * 6 + Math.min(G.count, 500) * 0.3) * incomeMult() * (replay ? 0.5 : 1));
    const close = G.count <= closeCall(level.boss);
    G.pending = { title: '스테이지 ' + G.stage + ' 클리어', text: (close ? '아슬아슬했어요! ' : '') + G.count.toLocaleString('ko-KR') + '명이 살아남았어요.', main: '다음 스테이지', stars: st, replay };
    d.stars[G.stage] = Math.max(d.stars[G.stage] || 0, st);
    d.best[G.stage] = Math.max(d.best[G.stage] || 0, G.count);
    if (!replay) d.level++;
    G.walkFrom = replay ? 0 : G.stage;
    G.nextStage = G.stage + 1;
    player.hop = 2;
    Sfx.win();
  } else {
    const progress = clamp(G.z / level.bossZ, 0, 1);
    gain = Math.round((3 + progress * 10) * incomeMult());
    // After a boss fight, say exactly how many more would have won it
    const short = G.short, tip = '업그레이드로 시작 인원을 늘리면 더 쉬워져요.';
    const text = !short ? tip
      : short <= closeCall(level.boss) ? '아깝다! ' + short.toLocaleString('ko-KR') + '마리만 더 있었으면 이겼어요.'
      : short.toLocaleString('ko-KR') + '마리가 모자랐어요. ' + tip;
    G.pending = { title: reason, text, main: '다시 도전', stars: 0 };
    G.nextStage = G.stage; G.walkFrom = 0;
    Sfx.lose();
  }
  d.coins += gain;
  Save.store();
  G.pending.gain = '코인 +' + gain.toLocaleString('ko-KR') + (G.pending.replay ? ' (재도전 보상)' : '');
  G.state = won ? 'win' : 'lose';
  G.endTimer = won ? 1.0 : 0.6;
}
function showResult() {
  const p = G.pending; if (!p) return;
  $('rTitle').textContent = p.title; $('rText').textContent = p.text;
  $('rGain').textContent = p.gain; $('rMain').textContent = p.main;
  $('rStars').hidden = !p.stars; if (p.stars) drawStars($('rStars'), p.stars);
  $('result').hidden = false; $('hud').hidden = true;
  G.pending = null;
  $('rMain').focus();
}

/* ---------- Floating text ---------- */
const v3 = new THREE.Vector3();
function toScreen(x, y, z) {
  v3.set(x, y, z).project(camera);
  if (v3.z > 1 || v3.z < -1) return null;
  return [(v3.x + 1) / 2 * app.clientWidth, (1 - v3.y) / 2 * app.clientHeight];
}
function floater(text, bad) {
  const p = toScreen(G.x, 3.2, G.z); if (!p) return;
  const el = document.createElement('div');
  el.className = 'floater' + (bad ? ' bad' : '');
  el.textContent = text;
  el.style.transform = `translate(${p[0]}px,${p[1]}px) translate(-50%,-50%)`;
  labels.appendChild(el);
  setTimeout(() => el.remove(), 850);
}
const pool = []; let used = 0;
function tag(x, y, z, text, cls) {
  const p = toScreen(x, y, z); if (!p) return;
  let el = pool[used];
  if (!el) { el = document.createElement('div'); labels.appendChild(el); pool.push(el); }
  used++;
  el.className = 'tag ' + cls;
  if (el.textContent !== text) el.textContent = text;
  el.style.transform = `translate(${p[0]}px,${p[1]}px) translate(-50%,-50%)`;
  el.hidden = false;
}

/* ---------- Simulation ---------- */
function hitHazard(h, x, z) {
  const dx = x - h.x, dz = z - h.z;
  if (h.type === 'spinner') {
    const c = Math.cos(h.ang), s = Math.sin(h.ang);
    return Math.abs(dx * c - dz * s) < 3.3 && Math.abs(dx * s + dz * c) < 0.6;
  }
  if (h.type === 'slider') return Math.abs(dx) < 2.2 && Math.abs(dz) < 0.6;
  return Math.abs(dx) < 2.25 && Math.abs(dz) < 2;
}

function step(dt) {
  G.t += dt;
  for (const h of hazards) {
    if (h.type === 'spinner') { h.ang += dt * 2.3 * h.side; h.mesh.rotation.y = h.ang; }
    else if (h.type === 'slider') { h.x = Math.sin(G.t * 1.5 + h.z) * 2.7; h.mesh.position.x = h.x; }
  }

  if (G.state === 'running') {
    G.z -= (G.fight ? 2.5 : SPEED) * dt;
    G.x = clamp(G.x + ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) * 9 * dt, -W + 0.6, W - 0.6);
    player.tiltT = clamp((G.x - G.lastX) / Math.max(dt, 0.001) / 10, -1, 1); G.lastX = G.x;
    player.cx = G.x; player.cz = G.z;

    // Gates: the side the crowd's centre is on decides
    for (const g of gates) {
      if (g.done || G.z > g.z) continue;
      g.done = true;
      const pick = G.x < 0 ? g.left : g.right, other = G.x < 0 ? g.right : g.left;
      G.count = applyOp(G.count, pick.g);
      pick.mesh.visible = false; other.mesh.material.opacity = 0.25;
      floater(pick.g.op + pick.g.v, !pick.g.good);
      if (pick.g.good) { Sfx.good(); player.jump = 1; } else { Sfx.bad(); player.flinch = 1; }
      sync();
    }

    // Hazards remove only the units that touch them
    G.bigHit = Math.max(0, G.bigHit - dt);
    for (const h of hazards) {
      if (Math.abs(G.z - h.z) > player.radius + 5) continue;
      // A little one that touches a hazard is lost. A bigger one loses about a third of what it is worth
      // (so a few little ones are knocked out of it), at most once every short while.
      const wet = h.type === 'pit';
      let lost = 0, broken = null;
      player.eachUnit(u => {
        const f = u.fr * 0.7;
        const hit = hitHazard(h, u.wx, u.wz) || (u.tier > 0 && (hitHazard(h, u.wx - f, u.wz) || hitHazard(h, u.wx + f, u.wz) || hitHazard(h, u.wx, u.wz - f) || hitHazard(h, u.wx, u.wz + f)));
        if (!hit) return;
        if (u.tier === 0) { player.killUnit(u); lost++; Fx.kill(u.wx, u.wz, wet); }
        else if (G.bigHit <= 0 && !broken) broken = u;
      });
      if (broken) {
        const loss = Math.ceil(TIER_VALUE[broken.tier] * 0.3);
        lost += loss; G.bigHit = 0.4;
        for (let j = 0; j < Math.min(loss, 5); j++) Fx.kill(broken.wx + (Math.random() - 0.5) * broken.fr * 2, broken.wz + (Math.random() - 0.5) * broken.fr * 2, wet);
      }
      if (!lost) continue;
      wet ? Sfx.plop() : Sfx.hit();
      G.count = Math.max(0, G.count - lost);
      if (G.count <= 0) { player.setValue(0); finish(false, '모두 쓰러졌어요'); return; }
      player.setValue(G.count, { prefer: broken });
    }

    // Rival crowds cancel one for one
    for (const f of foes) {
      if (f.dead) continue;
      const gap = G.z - f.view.cz;
      if (!f.isBoss && gap < 18 && gap > 0 && f !== G.fight) {
        f.view.hop = 1; f.view.cz += 3 * dt;
        f.view.cx += (G.x - f.view.cx) * Math.min(1, dt * 1.5);
      }
      if (!G.fight && gap < player.radius + f.view.radius + 0.8) {
        G.fight = f; f.acc = 0; f.view.hop = 1;
        // When a boss fight is going to be close, its last few exchanges play out slowly
        f.tense = f.isBoss && Math.abs(G.count - f.size) <= closeCall(f.size) ? Math.max(4, Math.round(Math.min(G.count, f.size) * 0.08)) : 0;
        f.rate = Math.max(12, Math.min(G.count, f.size) / (f.isBoss ? 1.5 : 0.8));
      }
    }
    const f = G.fight;
    if (f) {
      f.acc += f.rate * dt * (Math.min(G.count, f.size) <= f.tense ? 0.22 : 1);
      const k = Math.min(Math.floor(f.acc), G.count, f.size);
      if (k > 0) { f.acc -= k; G.count -= k; f.size -= k; Sfx.hit(); Fx.clash((G.x + f.view.cx) / 2, (G.z + f.view.cz) / 2, k); }
      f.view.cx += (G.x - f.view.cx) * Math.min(1, dt * 4);
      f.view.setValue(f.size);
      sync();
      if (G.count <= 0) { G.short = f.isBoss ? f.size + 1 : 0; finish(false, f.isBoss ? '보스 무리가 더 많았어요' : '모두 쓰러졌어요'); return; }
      if (f.size <= 0) {
        f.dead = true; f.view.group.visible = false; G.fight = null;
        if (f.isBoss) { finish(true); return; }
      }
    }
  } else if (G.state === 'win' || G.state === 'lose') {
    if (G.pending && (G.endTimer -= dt) <= 0) showResult();
  }
}

/* ---------- Camera and frame ---------- */
const camPos = new THREE.Vector3(0, 9, 12);
function frame(dt) {
  step(dt);
  const run = G.state === 'running';
  player.mode = run ? 'run' : G.state === 'win' ? 'cheer' : 'idle';
  if (!run) player.tiltT = 0;
  let near = !!G.fight;
  for (const f of foes) {
    if (f.dead) continue;
    f.view.armsT = f.view.hop >= 1 ? 1 : 0;
    if (f.view.cz < G.z && G.z - f.view.cz < 16) near = true;
  }
  player.armsT = run && near ? 1 : 0;
  player.update(dt, G.t);
  Fx.update(dt);
  for (const f of foes) if (!f.dead) f.view.update(dt, G.t);

  // Pull back and up when big penguins are present so they do not hide the gate ahead
  const r = player.radius + Math.max(0, player.tall - 1.26) * 1.8, far = portrait ? 1.25 : 1, menu = G.state === 'menu';
  const tx = G.x * 0.45, ty = (7.5 + r * 0.9) * far, tz = G.z + (10 + r * 1.3) * far;
  const k = 1 - Math.exp(-dt * 6);
  camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
  camera.position.copy(camPos);
  camera.lookAt(tx, menu ? -4.5 : 0, G.z - 8);

  used = 0;
  if (G.count > 0) tag(G.x, player.tall * 1.6 + 1.2, G.z, String(G.count), 'me');
  for (const f of foes) {
    if (f.dead || f.view.cz < G.z - 75 || f.view.cz > G.z + 3) continue;
    tag(f.view.cx, f.view.tall * 1.6 + 1.4, f.view.cz, String(f.size), 'foe');
  }
  for (let i = used; i < pool.length; i++) pool[i].hidden = true;
  if (G.state === 'running') $('barFill').style.width = (clamp(G.z / level.bossZ, 0, 1) * 100).toFixed(1) + '%';

  updateFar(dt, G.z, G.t, G.state === 'running' && !G.fight);
  renderer.render(scene, camera);
}
let prev = performance.now();
function loop(now) {
  const raw = (now - prev) / 1000, dt = Math.min(0.05, raw); prev = now;
  if (Q.shadows && !Q.locked) {
    Q.slow = raw > 0.034 ? Q.slow + Math.min(raw, 0.1) : Math.max(0, Q.slow - raw);
    if (Q.slow > 2.5) setShadows(false);
  }
  frame(dt);
  requestAnimationFrame(loop);
}
