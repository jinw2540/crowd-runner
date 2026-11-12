// Based on PR #1 (feature/login-ranking): Google login, profile and cloud stage progress.
// Anonymous identities are used only when the player explicitly starts a ranked run.
'use strict';
const Account = {
  sb: null, user: null, nickname: null, needNick: false, dirty: false, timer: 0,
  generation: 0, syncing: false, flushing: null, firstPush: false, revision: 0, error: '',
  get enabled() { return !!this.sb; },
  get state() { return { enabled: this.enabled, signedIn: !!this.user, anonymous: !!this.user?.is_anonymous, nickname: this.nickname, needNick: this.needNick }; },
  changed() { if (typeof G !== 'undefined' && G.mode === 'stage' && G.state === 'menu' && !$('menu').hidden && G.stage !== Save.data.level) toMenu(); else if (typeof refreshUI === 'function') refreshUI(); if (typeof updateNick === 'function') updateNick(); if (typeof OnlineUI !== 'undefined') OnlineUI.refresh(); },
  init() {
    const config = window.CROWD_ONLINE;
    if (!config?.url || !config?.publicKey) return;
    // Optional SDK loads asynchronously: a slow login service must never delay the game.
    const connect = () => {
      if (!window.supabase?.createClient || this.sb) return;
      this.sb = window.supabase.createClient(config.url, config.publicKey);
      this.sb.auth.onAuthStateChange((_event, session) => { setTimeout(() => this.onSession(session?.user || null), 0); });
      this.sb.auth.getSession().then(({ data }) => this.onSession(data.session?.user || null)).catch(() => {});
      this.changed();
    };
    if (window.supabase) connect();
    else {
      const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
      script.onload = connect; script.onerror = () => { this.error = '로그인을 불러오지 못했어요. 연습은 계속할 수 있어요.'; this.changed(); }; document.head.appendChild(script);
    }
    window.addEventListener('online', () => { if (this.dirty) this.flushNow(); });
  },
  async onSession(user) {
    if ((user?.id || null) === (this.user?.id || null) && !!user?.is_anonymous === !!this.user?.is_anonymous) return;
    const gen = ++this.generation; clearTimeout(this.timer); this.dirty = false;
    this.user = user; this.nickname = null; this.needNick = false; this.firstPush = false;
    if (typeof Endless !== 'undefined' && Endless.session && Endless.session.user !== user?.id) Endless.session.invalidate('계정이 바뀌어 연습 기록으로 전환했어요.');
    if (!user) { Save.switchUser(null); this.changed(); return; }
    if (!user.is_anonymous) Save.switchUser(user.id);
    this.syncing = true;
    try {
      const profile = await this.sb.from('profiles').select('nickname').eq('id', user.id).maybeSingle();
      if (gen !== this.generation) return;
      if (profile.error) throw profile.error;
      this.nickname = profile.data?.nickname || null; this.needNick = !profile.data;
      if (!user.is_anonymous) {
        const result = await this.sb.from('progress').select('*').eq('user_id', user.id).maybeSingle();
        if (gen !== this.generation) return;
        if (result.error) throw result.error;
        const r = result.data;
        if (r) Save.merge({ level: r.level, coins: r.coins, upStart: r.up_start, upIncome: r.up_income, stars: r.stars, best: r.best });
        this.firstPush = true; Save.store(); await this.flushNow();
      }
    } catch (_) { if (gen === this.generation) this.error = '기록을 동기화하지 못했어요. 기기의 기록은 남아 있어요.'; }
    finally { if (gen === this.generation) { this.syncing = false; this.changed(); } }
  },
  async ensureGuest() {
    if (!this.sb) throw new Error('온라인 랭킹이 아직 준비되지 않았어요.');
    if (this.syncing) throw new Error('로그인 정보를 확인하고 있어요. 잠시 후 다시 눌러 주세요.');
    if (!this.user) {
      const { data, error } = await this.sb.auth.signInAnonymously();
      if (error) throw new Error('게스트 로그인을 시작하지 못했어요. 구글 로그인이나 연습을 이용해 주세요.');
      await this.onSession(data.user);
    }
    // A failed initial profile read must be retried, not leave the nickname dialog unreachable.
    if (this.user && !this.nickname && !this.needNick) {
      const gen = this.generation, profile = await this.sb.from('profiles').select('nickname').eq('id', this.user.id).maybeSingle();
      if (gen !== this.generation || profile.error) throw new Error('닉네임을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      this.nickname = profile.data?.nickname || null; this.needNick = !this.nickname; this.error = ''; this.changed();
    }
    return this.user;
  },
  async signIn() {
    if (!this.sb) return;
    const options = { provider: 'google', options: { redirectTo: location.origin + location.pathname } };
    try {
      const result = this.user?.is_anonymous ? await this.sb.auth.linkIdentity(options) : await this.sb.auth.signInWithOAuth(options);
      if (result.error) throw result.error;
    } catch (_) { this.error = '구글 로그인을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.'; this.changed(); }
  },
  async signOut() {
    if (!this.sb) return;
    await this.flushNow();
    const { error } = await this.sb.auth.signOut();
    if (error) { this.error = '로그아웃하지 못했어요. 연결을 확인해 주세요.'; this.changed(); return; }
    await this.onSession(null);
  },
  push() {
    if (!this.user || this.user.is_anonymous || !this.sb) return;
    this.dirty = true; this.revision++; clearTimeout(this.timer); this.timer = setTimeout(() => this.flushNow(), 2000);
  },
  async flushNow() {
    clearTimeout(this.timer);
    if (this.flushing) { await this.flushing; if (this.dirty) return this.flushNow(); return; }
    if (!this.dirty || !this.user || this.user.is_anonymous) return;
    const gen = this.generation, revision = this.revision, d = Save.data;
    const payload = JSON.parse(JSON.stringify({ level: d.level, coins: d.coins, upStart: d.upStart, upIncome: d.upIncome, stars: d.stars, best: d.best }));
    this.flushing = (async () => {
      try {
        const { data, error } = await this.sb.rpc('save_progress', { p_data: payload, p_merge: this.firstPush });
        if (gen !== this.generation) return;
        if (error) throw error;
        if (!data?.ok) { this.error = '진행도를 서버에 저장하지 못했어요. 기기의 기록은 유지됩니다.'; this.dirty = false; }
        else { this.firstPush = false; this.dirty = revision !== this.revision; this.error = ''; }
      } catch (_) { if (gen === this.generation) this.dirty = true; }
    })();
    try { await this.flushing; } finally { this.flushing = null; }
  },
  async setNickname(name) {
    name = String(name).trim().normalize('NFC');
    if (Array.from(name).length < 2 || Array.from(name).length > 12 || /[\u0000-\u001f\u007f]/.test(name)) return 'short';
    if (!this.user || !this.sb) return 'error';
    const gen = this.generation;
    try {
      const { error } = await this.sb.from('profiles').upsert({ id: this.user.id, nickname: name });
      if (gen !== this.generation) return 'error';
      if (error) return error.code === '23505' ? 'dup' : 'error';
      this.nickname = name; this.needNick = false; this.changed(); return 'ok';
    } catch (_) { return 'error'; }
  },
  async top() {
    if (!this.sb) return null;
    try { const { data, error } = await this.sb.from('leaderboard').select('rank,nickname,level,total_stars').order('rank').limit(100); return error ? null : data; } catch (_) { return null; }
  },
  async myRank() {
    if (!this.user || !this.sb) return null;
    try { const { data, error } = await this.sb.rpc('my_rank'); return error ? null : data?.[0]; } catch (_) { return null; }
  },
  async request(path, body, requireUser = true) {
    const config = window.CROWD_ONLINE; if (!config?.url || !config?.publicKey) throw Object.assign(new Error('not_configured'), { status: 503 });
    const headers = { apikey: config.publicKey, 'Content-Type': 'application/json' };
    if (this.sb) { const { data } = await this.sb.auth.getSession(); if (data.session) headers.Authorization = 'Bearer ' + data.session.access_token; }
    if (requireUser && !headers.Authorization) throw Object.assign(new Error('sign_in_required'), { status: 401 });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(config.url.replace(/\/$/, '') + '/functions/v1/' + config.functionName + '/' + path,
        { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || 'temporarily_unavailable'), { status: response.status }); return data;
    } finally { clearTimeout(timer); }
  }
};
