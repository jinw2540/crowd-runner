// Input handling and start-up. Loaded last.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Input ---------- */
let dragX = null;
canvas.addEventListener('pointerdown', e => { dragX = e.clientX; Sfx.ensure(); try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } });
canvas.addEventListener('pointermove', e => {
  if (dragX === null) return;
  if (G.state === 'running') G.x = clamp(G.x + (e.clientX - dragX) * 13 / Math.min(app.clientWidth, 520), -W + 0.6, W - 0.6);
  dragX = e.clientX;
});
const endDrag = () => { dragX = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const setKey = (e, v) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.l = v;
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.r = v;
  else return;
  e.preventDefault();
};
window.addEventListener('keydown', e => setKey(e, true));
window.addEventListener('keyup', e => setKey(e, false));
window.addEventListener('blur', () => { keys.l = keys.r = false; });

$('start').addEventListener('click', () => { Sfx.ensure(); startRun(false); });
$('rMain').addEventListener('click', () => { Sfx.ensure(); playStage(G.nextStage); });
$('rMap').addEventListener('click', () => { const from = G.walkFrom; G.walkFrom = 0; openMap(from); });
$('openMap').addEventListener('click', () => openMap(0));
$('mapBack').addEventListener('click', toMenu);
$('sGo').addEventListener('click', () => { Sfx.ensure(); playStage(mapSel); });
window.addEventListener('resize', () => { if (!$('map').hidden) { renderMap(); selectStage(mapSel); } });
$('rMenu').addEventListener('click', toMenu);
$('upStart').addEventListener('click', () => {
  const c = costStart(), d = Save.data;
  if (d.coins < c || d.upStart >= 30) return;
  d.coins -= c; d.upStart++; Save.store(); Sfx.ensure(); Sfx.good();
  resetRun(); refreshUI();
});
$('upIncome').addEventListener('click', () => {
  const c = costIncome(), d = Save.data;
  if (d.coins < c) return;
  d.coins -= c; d.upIncome++; Save.store(); Sfx.ensure(); Sfx.good();
  refreshUI();
});
$('mute').addEventListener('click', () => { Save.data.muted = !Save.data.muted; Save.store(); refreshUI(); });

/* ---------- Boot ---------- */
window.__game = {
  get state() { return G.state; }, get count() { return G.count; }, get x() { return G.x; }, get z() { return G.z; },
  get level() { return Save.data.level; }, get coins() { return Save.data.coins; }, get stage() { return G.stage; },
  get stars() { return Save.data.stars; }, get best() { return Save.data.best; }, starsFor,
  get data() { return level; }, genLevel, applyOp,
  get units() { return player.tiers.map(l => l.length); }, setCount(n) { G.count = n; sync(); },
  get shadows() { return Q.shadows; }, lockShadows(on) { Q.locked = true; setShadows(on); }
};
toMenu();
if (document.fonts && document.fonts.load) {
  document.fonts.load('104px Jua').then(() => { if (G.state === 'menu' && $('map').hidden) toMenu(); }).catch(() => {});
}
requestAnimationFrame(loop);
