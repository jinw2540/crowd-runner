// Google login, cloud save and leaderboard through Supabase. Loaded right after core.js.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
// If Supabase is not configured or cannot be loaded, every method does nothing and the game stays in guest mode.
'use strict';

// Fill these in from Supabase → Project Settings → API. The anon key is meant to be public.
// Never put the service_role key here.
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

const Account = {
  sb: null,
  user: null,        // Supabase user, or null for a guest
  nickname: null,    // chosen nickname, or null before one is picked
  needNick: false,   // signed in but no profile row yet
  firstPush: false,  // the next push is the first sync after login (merge = true)
  dirty: false,
  timer: 0,
  syncing: false,

  get enabled() { return !!this.sb; },
  get state() { return { enabled: this.enabled, signedIn: !!this.user, nickname: this.nickname, needNick: this.needNick }; },

  changed() {
    try {
      if (typeof G !== 'undefined' && G.state === 'menu' && $('map').hidden && $('ranking').hidden && G.stage !== Save.data.level) toMenu();
      else refreshUI();
      if (typeof updateNick === 'function') updateNick();
    } catch (e) { /* UI not ready yet */ }
  },

  init() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase || !window.supabase.createClient) return;
    try {
      this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      this.sb.auth.onAuthStateChange((event, session) => {
        // Do not call Supabase inside this callback; defer to avoid a deadlock.
        setTimeout(() => this.onSession(session && session.user || null), 0);
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.dirty) this.flush(); });
    } catch (e) { this.sb = null; }
  },

  async onSession(user) {
    const same = (user && user.id) === (this.user && this.user.id);
    this.user = user;
    if (!user) { this.nickname = null; this.needNick = false; this.firstPush = false; this.changed(); return; }
    if (same || this.syncing) { this.changed(); return; }
    await this.sync();
  },

  async signIn() {
    if (!this.sb) return;
    try {
      await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    } catch (e) { /* offline: stay a guest */ }
  },

  async signOut() {
    if (!this.sb) return;
    try { await this.flushNow(); await this.sb.auth.signOut(); } catch (e) { /* ignore */ }
    this.user = null; this.nickname = null; this.needNick = false; this.firstPush = false;
    this.changed();
  },

  // After login: fetch the server copy, merge it into the local one, save, and push once with merge = true.
  async sync() {
    this.syncing = true;
    try {
      const remote = await this.pull();
      await this.loadProfile();
      this.firstPush = true;
      if (remote) Save.merge(remote);
      Save.store();
      await this.flushNow();
    } catch (e) { /* offline: keep playing locally */ }
    this.syncing = false;
    this.changed();
  },

  async pull() {
    if (!this.user) return null;
    const { data, error } = await this.sb.from('progress').select('*').eq('user_id', this.user.id).maybeSingle();
    if (error || !data) return null;
    return { level: data.level, coins: data.coins, upStart: data.up_start, upIncome: data.up_income, stars: data.stars, best: data.best };
  },

  // Called from Save.store(). Waits 2 seconds so quick successive saves go out as one request.
  push() {
    if (!this.user || !this.sb) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 2000);
  },
  flushNow() { clearTimeout(this.timer); return this.flush(); },
  async flush() {
    if (!this.user || !this.sb || !this.dirty) return;
    this.dirty = false;
    const d = Save.data;
    const payload = { level: d.level, coins: d.coins, upStart: d.upStart, upIncome: d.upIncome, stars: d.stars, best: d.best };
    try {
      const { data, error } = await this.sb.rpc('save_progress', { p_data: payload, p_merge: this.firstPush });
      if (error) throw error;
      if (data && data.ok === false) console.warn('save rejected:', data.reason);
      else this.firstPush = false;
    } catch (e) { this.dirty = true; /* retry on the next save */ }
  },

  async loadProfile() {
    const { data, error } = await this.sb.from('profiles').select('nickname').eq('id', this.user.id).maybeSingle();
    if (error) return;
    this.nickname = data ? data.nickname : null;
    this.needNick = !data;
  },

  // Returns 'ok', 'short', 'dup' or 'error'.
  async setNickname(name) {
    name = String(name).trim();
    if (name.length < 2 || name.length > 12) return 'short';
    if (!this.user || !this.sb) return 'error';
    try {
      const { error } = await this.sb.from('profiles').insert({ id: this.user.id, nickname: name });
      if (error) return error.code === '23505' ? 'dup' : error.code === '23514' ? 'short' : 'error';
      this.nickname = name; this.needNick = false;
      this.changed();
      return 'ok';
    } catch (e) { return 'error'; }
  },

  // Top 100 rows: { rank, nickname, level, total_stars }. Returns null when unavailable.
  async top() {
    if (!this.sb) return null;
    try {
      const { data, error } = await this.sb.from('leaderboard').select('rank,nickname,level,total_stars').limit(100);
      return error ? null : data;
    } catch (e) { return null; }
  },
  async myRank() {
    if (!this.sb || !this.user) return null;
    try {
      const { data, error } = await this.sb.rpc('my_rank');
      return error || !data || !data.length ? null : data[0];
    } catch (e) { return null; }
  }
};
