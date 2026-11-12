'use strict';
const OnlineUI = {
  rankKind: 'daily', rankReturn: 'menu', request: 0, nickDismissed: null,
  format(n) { return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('ko-KR'); },
  message(text) { $('endlessMessage').textContent = text; $('endlessMessage').hidden = !text; },
  busy(value) { $('startRanked').disabled = value || !Account.enabled; $('startPractice').disabled = value; },
  hide() { for (const id of ['endlessMenu','endlessPause','endlessResult','endlessInfo']) $(id).hidden = true;
    $('hud').classList.remove('endless-hud'); $('hCoins').classList.add('coin'); $('hScore').hidden = $('pauseEndless').hidden = true; },
  refresh() {
    if (Endless.recordUser !== (Account.user?.id || null)) Endless.loadRanked(Account.user?.id);
    $('practiceBest').textContent = this.format(Endless.records.practice) + '점';
    $('rankedBest').textContent = this.format(Endless.records.ranked) + '점';
    $('dailyCourse').textContent = EndlessCore.dayAt() + ' · 오늘의 공통 코스';
    $('startRanked').disabled = !Account.enabled;
    $('startRanked').textContent = Account.enabled ? '오늘의 랭킹 도전' : '온라인 랭킹 준비 중';
    $('accountMessage').hidden = !Account.error; $('accountMessage').textContent = Account.error;
    if (G.mode === 'endless') this.hud();
  },
  openMenu() {
    if (G.mode === 'endless') { Endless.exit(); toMenu(); }
    this.hide(); $('menu').hidden = $('ranking').hidden = $('result').hidden = $('map').hidden = true;
    $('endlessMenu').hidden = false; this.message(''); this.refresh(); $('startPractice').focus();
    this.refreshBest();
  },
  async refreshBest() {
    const user = Account.user?.id; if (!user) return;
    try {
      const board = await Account.request('leaderboard?day=' + EndlessCore.dayAt(), undefined, false);
      if (Account.user?.id !== user) return;
      Endless.records.ranked = Math.max(Endless.records.ranked, Number(board.best?.score) || 0);
      Endless.saveRecords(); this.refresh();
    } catch (_) { /* The last locally confirmed record remains visible while offline. */ }
  },
  play() {
    for (const id of ['menu','result','ranking','map','nick','endlessMenu','endlessResult','endlessPause']) $(id).hidden = true;
    $('hud').hidden = false; $('hud').classList.add('endless-hud'); $('hCoins').classList.remove('coin');
    $('hScore').hidden = $('pauseEndless').hidden = $('endlessInfo').hidden = false; this.hud();
  },
  hud() {
    if (!Endless.state) return; const s = Endless.state;
    $('hStage').textContent = '무한 달리기'; $('hCoins').textContent = this.format(s.distance / 1000) + 'm';
    $('hScore').textContent = this.format(s.score) + '점';
    const interval = EndlessCore.RULES.chunk * EndlessCore.RULES.bossEvery;
    const next = (Math.floor((s.distance + 24000) / interval) + 1) * interval - 24000;
    $('nextBoss').textContent = s.fight?.event.boss ? '보스와 우당탕탕!' : '다음 보스 ' + this.format((next - s.distance) / 1000) + 'm';
    this.connection();
  },
  connection() {
    const session = Endless.session;
    $('endlessConnection').textContent = !session ? '연습 · 기기에 기록' : session.valid ? '랭킹 도전 · ' + session.status : '연습으로 전환';
    if (!$('endlessResult').hidden) {
      $('submitStatus').textContent = !session ? '연습 기록을 이 기기에 저장했어요.' : session.status;
      $('endlessResultKind').textContent = session?.result ? '오늘의 랭킹에 기록했어요' : session?.valid ? '오늘의 랭킹 도전' : '나의 연습 기록';
      if (session?.result) {
        const r = session.result;
        $('endlessScore').textContent = this.format(r.score) + '점';
        $('resultDistance').textContent = this.format(r.distance / 1000) + 'm';
        $('resultBosses').textContent = r.bosses + '회 · +' + this.format(r.bosses * 500);
        $('resultClean').textContent = r.clean + '구간 · +' + this.format(r.clean * 200);
      }
    }
  },
  result() {
    const s = Endless.state; $('hud').hidden = $('endlessInfo').hidden = true; $('endlessResult').hidden = false;
    $('endlessScore').textContent = this.format(s.score) + '점';
    $('endlessReason').textContent = s.reason || '여기까지 달렸어요. 다음엔 더 멀리!';
    $('resultDistance').textContent = this.format(s.distance / 1000) + 'm';
    $('resultBosses').textContent = s.bosses + '회 · +' + this.format(s.bosses * 500);
    $('resultClean').textContent = s.clean + '구간 · +' + this.format(s.clean * 200);
    $('retrySubmit').hidden = true; this.connection(); $('againEndless').focus();
  },
  row(r, kind, element = document.createElement('li')) {
    element.textContent = ''; element.className = 'rank-row' + (r.me ? ' me' : '');
    const values = kind === 'daily' ? [r.rank, r.nickname, this.format(r.score) + '점', this.format(r.distance / 1000) + 'm']
      : [r.rank, r.nickname, '스테이지 ' + r.level, '★ ' + r.total_stars];
    values.forEach((value, i) => { const span = document.createElement(i ? 'span' : 'b'); span.textContent = value; element.appendChild(span); });
    return element;
  },
  async openRanking(kind = 'daily', preserveReturn = false) {
    const request = ++this.request;
    if (!preserveReturn) this.rankReturn = !$('endlessResult').hidden ? 'endlessResult' : !$('endlessMenu').hidden ? 'endlessMenu' : 'menu';
    this.rankKind = kind;
    for (const id of ['menu','endlessMenu','endlessResult','nick']) $(id).hidden = true;
    $('ranking').hidden = false; $('rankList').textContent = ''; $('rankMe').hidden = $('rankGap').hidden = true;
    $('rankDaily').classList.toggle('selected', kind === 'daily'); $('rankStage').classList.toggle('selected', kind === 'stage');
    $('rankTitle').textContent = kind === 'daily' ? '오늘의 랭킹' : '탐험 랭킹';
    const day = this.rankReturn === 'endlessResult' && Endless.session ? Endless.session.day : EndlessCore.dayAt();
    $('rankNote').textContent = kind === 'daily' ? day + ' · 한국 시간' : '스테이지 → 별';
    const msg = $('rankMsg'); msg.hidden = false; msg.textContent = '기록을 불러오고 있어요…';
    try {
      if (!Account.enabled) { msg.textContent = '온라인 랭킹을 준비하고 있어요. 연습 기록은 기기에 저장됩니다.'; return; }
      if (kind === 'daily') {
        const result = await Account.request('leaderboard?day=' + encodeURIComponent(day), undefined, false);
        if (request !== this.request) return;
        const rows = result.rows || []; rows.forEach(r => $('rankList').appendChild(this.row(r, kind)));
        if (result.me?.rank > 100) {
          const note = document.createElement('li'); note.className = 'rank-msg'; note.textContent = '내 주변의 기록'; $('rankList').appendChild(note);
          (result.around || []).filter(r => r.rank > 100).forEach(r => $('rankList').appendChild(this.row(r, kind)));
        }
        if (result.me) { this.row(result.me, kind, $('rankMe')); $('rankMe').hidden = false; }
        if (result.gap) { $('rankGap').textContent = '바로 위 기록까지 ' + this.format(result.gap) + '점'; $('rankGap').hidden = false; }
        msg.hidden = rows.length > 0; msg.textContent = '오늘의 첫 기록을 남겨 보세요!';
      } else {
        const [rows, mine] = await Promise.all([Account.top(), Account.myRank()]);
        if (request !== this.request) return;
        if (!rows) throw new Error('unavailable');
        rows.forEach(r => $('rankList').appendChild(this.row({ ...r, me: r.nickname === Account.nickname }, kind)));
        if (mine) { this.row({ ...mine, nickname: Account.nickname, me: true }, kind, $('rankMe')); $('rankMe').hidden = false; }
        msg.hidden = rows.length > 0; msg.textContent = '구글 로그인 후 탐험 기록을 남겨 보세요.';
      }
    } catch (_) { if (request === this.request) msg.textContent = '지금은 랭킹을 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.'; }
  },
  backRank() { this.request++; $('ranking').hidden = true; if (this.rankReturn === 'menu') toMenu(); else $(this.rankReturn).hidden = false; }
};
function updateNick() {
  const show = Account.needNick && G.state === 'menu' && (Endless.pendingRanked || OnlineUI.nickDismissed !== Account.user?.id) && $('ranking').hidden && $('map').hidden;
  if ($('nick').hidden === !show) return; $('nick').hidden = !show; if (show) $('nickInput').focus();
}
