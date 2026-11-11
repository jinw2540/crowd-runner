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

/* ---------- Account and ranking ---------- */
$('signIn').addEventListener('click', () => Account.signIn());
$('signOut').addEventListener('click', () => Account.signOut());

// Show the nickname card when a signed-in player has no nickname yet.
function updateNick() {
  const show = Account.needNick && G.state === 'menu' && $('ranking').hidden && $('map').hidden;
  if ($('nick').hidden === !show) return;
  $('nick').hidden = !show;
  if (show) $('nickInput').focus();
}
const NICK_ERR = { short: '닉네임은 2~12자로 정해 주세요.', dup: '이미 쓰는 닉네임이에요.', error: '저장하지 못했어요. 잠시 뒤에 다시 해 보세요.' };
$('nickForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('nickOk').disabled = true;
  const r = await Account.setNickname($('nickInput').value);
  $('nickOk').disabled = false;
  $('nickErr').hidden = r === 'ok';
  if (r !== 'ok') $('nickErr').textContent = NICK_ERR[r];
});

// Nicknames come from other players: always insert them with textContent, never innerHTML.
function fillRank(el, r) {
  el.textContent = '';
  [r.rank, r.nickname, '스테이지 ' + r.level, '★ ' + r.total_stars].forEach((t, i) => {
    const c = document.createElement(i === 0 ? 'b' : 'span'); c.textContent = t; el.appendChild(c);
  });
  return el;
}
function rankRow(r) {
  const li = document.createElement('li');
  li.className = 'rank-row' + (Account.user && r.nickname === Account.nickname ? ' me' : '');
  return fillRank(li, r);
}
async function openRanking() {
  $('menu').hidden = true; $('nick').hidden = true; $('ranking').hidden = false;
  const msg = $('rankMsg'), list = $('rankList'), me = $('rankMe');
  list.textContent = ''; me.hidden = true;
  msg.hidden = false;
  if (!Account.enabled) { msg.textContent = '지금은 랭킹을 볼 수 없어요.'; return; }
  msg.textContent = Account.user ? '불러오는 중…' : '로그인하면 랭킹에 올라가요.';
  const rows = await Account.top();
  if (!rows) { msg.textContent = '랭킹을 불러오지 못했어요.'; return; }
  if (Account.user) msg.hidden = true;
  if (!rows.length && Account.user) { msg.hidden = false; msg.textContent = '아직 랭킹에 오른 사람이 없어요.'; }
  rows.forEach(r => list.appendChild(rankRow(r)));
  const mine = await Account.myRank();
  if (mine && Account.nickname) { fillRank(me, { rank: mine.rank, nickname: Account.nickname, level: mine.level, total_stars: mine.total_stars }); me.hidden = false; }
}
$('openRank').addEventListener('click', openRanking);
$('rankBack').addEventListener('click', toMenu);

/* ---------- Boot ---------- */
window.__game = {
  get state() { return G.state; }, get count() { return G.count; }, get x() { return G.x; }, get z() { return G.z; },
  get level() { return Save.data.level; }, get coins() { return Save.data.coins; }, get stage() { return G.stage; },
  get account() { return Account.state; },
  get stars() { return Save.data.stars; }, get best() { return Save.data.best; }, starsFor,
  get data() { return level; }, genLevel, applyOp,
  get units() { return player.tiers.map(l => l.length); }, setCount(n) { G.count = n; sync(); },
  get shadows() { return Q.shadows; }, lockShadows(on) { Q.locked = true; setShadows(on); }
};
toMenu();
Account.init();
if (document.fonts && document.fonts.load) {
  document.fonts.load('104px Jua').then(() => { if (G.state === 'menu' && $('map').hidden) toMenu(); }).catch(() => {});
}
requestAnimationFrame(loop);
