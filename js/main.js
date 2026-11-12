// Input handling and start-up. Loaded last.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Input ---------- */
let dragX = null;
canvas.addEventListener('pointerdown', e => { dragX = e.clientX; Sfx.ensure(); try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } });
canvas.addEventListener('pointermove', e => {
  if (dragX === null) return;
  if (G.state === 'running') {
    const delta = (e.clientX - dragX) * 13 / Math.min(app.clientWidth, 520);
    if (G.mode === 'endless') Endless.target = clamp(Endless.target + delta * 1000, -4400, 4400);
    else G.x = clamp(G.x + delta, -W + 0.6, W - 0.6);
  }
  dragX = e.clientX;
});
const endDrag = () => { dragX = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const setKey = (e, v) => {
  if (e.target instanceof HTMLInputElement) return;
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

/* ---------- Account and online modes ---------- */
$('signIn').addEventListener('click', () => Account.signIn());
$('signOut').addEventListener('click', () => Account.signOut());
$('nickForm').addEventListener('submit', async e => {
  e.preventDefault(); $('nickOk').disabled = true;
  const result = await Account.setNickname($('nickInput').value); $('nickOk').disabled = false;
  $('nickErr').hidden = result === 'ok';
  $('nickErr').textContent = result === 'dup' ? '이미 쓰는 닉네임이에요.' : result === 'short' ? '닉네임은 2~12자로 정해 주세요.' : '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  if (result === 'ok' && Endless.pendingRanked) { Endless.pendingRanked = false; Endless.start(true); }
});
$('nickLater').addEventListener('click', () => { OnlineUI.nickDismissed = Account.user?.id; Endless.pendingRanked = false; $('nick').hidden = true; });
$('openRank').addEventListener('click', () => OnlineUI.openRanking());
$('rankBack').addEventListener('click', () => OnlineUI.backRank());
$('rankDaily').addEventListener('click', () => OnlineUI.openRanking('daily', true));
$('rankStage').addEventListener('click', () => OnlineUI.openRanking('stage', true));
$('openEndless').addEventListener('click', () => OnlineUI.openMenu());
$('endlessBack').addEventListener('click', toMenu);
$('startPractice').addEventListener('click', () => Endless.start(false));
$('startRanked').addEventListener('click', () => Endless.start(true));
$('endlessRank').addEventListener('click', () => OnlineUI.openRanking());
$('pauseEndless').addEventListener('click', () => Endless.pause());
$('resumeEndless').addEventListener('click', () => Endless.resume());
$('quitEndless').addEventListener('click', () => Endless.end('quit'));
$('againEndless').addEventListener('click', () => OnlineUI.openMenu());
$('resultRank').addEventListener('click', () => OnlineUI.openRanking());
$('endlessHome').addEventListener('click', toMenu);
$('retrySubmit').addEventListener('click', () => Endless.submit());
document.addEventListener('visibilitychange', () => { if (document.hidden) Endless.pause(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && G.mode === 'endless') { G.state === 'paused' ? Endless.resume() : Endless.pause(); } });

/* ---------- Boot ---------- */
window.__game = {
  get state() { return G.state; }, get mode() { return G.mode; },
  get endless() { return Endless.state ? { ...Endless.state, sectors: EndlessScene.sectors.size } : null; }, get count() { return G.count; }, get x() { return G.x; }, get z() { return G.z; },
  get level() { return Save.data.level; }, get coins() { return Save.data.coins; }, get stage() { return G.stage; },
  get account() { return Account.state; },
  get stars() { return Save.data.stars; }, get best() { return Save.data.best; }, starsFor,
  get data() { return level; }, genLevel, applyOp,
  get units() { return player.tiers.map(l => l.length); }, setCount(n) { if (G.mode !== 'endless') { G.count = n; sync(); } },
  get shadows() { return Q.shadows; }, lockShadows(on) { Q.locked = true; setShadows(on); }
};
toMenu();
Account.init();
if (document.fonts && document.fonts.load) {
  document.fonts.load('104px Jua').then(() => { if (G.state === 'menu' && !$('menu').hidden) toMenu(); }).catch(() => {});
}
requestAnimationFrame(loop);

