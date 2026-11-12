// Streaming presentation for the shared endless simulation. Stage mode keeps its original rules.
'use strict';
const EndlessScene = {
  sectors: new Map(), origin: 0, road: null, shared: new Set(),
  disposeObject(root) {
    const resources = new Set();
    root.traverse(o => {
      if (o.geometry && !SHARED.has(o.geometry) && !this.shared.has(o.geometry) && !IceEnvironment.isShared(o.geometry)) resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        if (!this.shared.has(m) && !IceEnvironment.isShared(m)) { resources.add(m); if (m.map) resources.add(m.map); }
      }
      if (o.customDepthMaterial) resources.add(o.customDepthMaterial);
      if (o.isInstancedMesh) o.dispose();
    });
    resources.forEach(r => r.dispose()); root.removeFromParent();
  },
  clear() {
    for (const sector of this.sectors.values()) { for (const f of sector.items.foes) this.disposeObject(f.view.group); this.disposeObject(sector.root); }
    this.sectors.clear(); if (levelGroup) { scene.remove(levelGroup); levelGroup = null; }
    gates = []; foes = []; hazards = []; this.origin = 0; water.setOrigin(0);
  },
  init(state) {
    disposeLevel(); levelGroup = new THREE.Group(); levelGroup.name = 'Endless ice road'; scene.add(levelGroup);
    iceScenery = null; this.sectors.clear(); this.origin = 0; water.setOrigin(0);
    if (!this.road) {
      this.road = IceEnvironment.road(W * 2 + 2.6, EndlessCore.RULES.chunk / 1000 + .8);
      this.road.traverse(o => { if (o.geometry) this.shared.add(o.geometry); if (o.material) this.shared.add(o.material); });
    }
    this.sync(state);
  },
  create(index, seed) {
    const data = EndlessCore.chunk(seed, index), root = new THREE.Group(); root.name = 'Ice stretch ' + index;
    const items = { gates: [], hazards: [], foes: [] }, length = EndlessCore.RULES.chunk / 1000;
    const road = this.road.clone(true); road.position.z = -length / 2; root.add(road);
    const floes = IceEnvironment.driftField({ length, halfWidth: W, seaY: SEA_Y, random: EndlessCore.rng(EndlessCore.hash('scenery:' + seed + ':' + index)) });
    floes.root.position.z = -18; root.add(floes.root);
    const contours = [water.outline(this.road.userData.shoreline, { z: -length / 2 })];
    for (const e of floes.placements) contours.push(water.outline(IceEnvironment.outline(e.variant), { ...e, z: e.z - 18 }));
    root.add(water.createContacts(contours));
    const segments = data.events.map(e => ({ ...e, z: -(e.at - data.start) / 1000, x: 0 }));
    buildSegments(segments, root, items, EndlessCore.rng(EndlessCore.hash('decoration:' + seed + ':' + index)));
    for (const f of items.foes) { levelGroup.add(f.view.group); f.view.group.position.z = 0; }
    root.traverse(o => { if (o.isMesh && !o.userData.crowd && !o.material.transparent) { o.receiveShadow = true; o.castShadow = !o.userData.ground; } });
    root.position.z = this.origin - data.start / 1000; levelGroup.add(root);
    const sector = { root, items, data, floes }; this.sectors.set(index, sector); return sector;
  },
  sync(s) {
    const center = Math.floor(s.distance / EndlessCore.RULES.chunk), origin = Math.floor(center / 8) * 8 * EndlessCore.RULES.chunk / 1000;
    if (origin !== this.origin) {
      const delta = origin - this.origin; this.origin = origin; camPos.z += delta; Combat.rebase(delta); Fx.rebase(delta); water.setOrigin(-origin);
    }
    for (let i = Math.max(0, center - 1); i <= center + 3; i++) if (!this.sectors.has(i)) this.create(i, s.seed);
    for (const [i, sector] of this.sectors) {
      if (i < center - 1 || i > center + 3) { for (const f of sector.items.foes) this.disposeObject(f.view.group); this.disposeObject(sector.root); this.sectors.delete(i); continue; }
      sector.root.position.z = origin - sector.data.start / 1000;
      sector.root.visible = i <= center + 1;
      for (const gate of sector.items.gates) {
        const ei = sector.data.events.findIndex(e => e.id === gate.id);
        gate.done = i < s.chunkIndex || (i === s.chunkIndex && ei < s.eventIndex);
        gate.left.mesh.visible = gate.right.mesh.visible = !gate.done;
      }
      for (const h of sector.items.hazards) {
        const e = sector.data.events.find(e => e.id === h.id), pose = EndlessCore.hazardPose(e, s.tick);
        h.x = pose.x / 1000; h.mesh.position.x = h.x; h.ang = pose.angle; h.mesh.rotation.y = h.ang;
      }
      for (const f of sector.items.foes) {
        const ei = sector.data.events.findIndex(e => e.id === f.id), e = sector.data.events[ei];
        const fighting = s.fight?.event.id === e.id;
        f.dead = !fighting && (i < s.chunkIndex || (i === s.chunkIndex && ei < s.eventIndex));
        f.view.group.visible = !f.dead && i <= center + 1;
        f.view.cz = origin - e.at / 1000 - 5;
        f.view.cx = fighting ? s.x / 1000 : 0; f.view.hop = fighting ? 1 : .25;
        const count = fighting ? s.fight.remaining : e.size;
        if (f.view.value !== count) f.view.setValue(count);
        f.size = count;
      }
    }
    gates = Array.from(this.sectors.values()).flatMap(c => c.items.gates);
    hazards = Array.from(this.sectors.values()).flatMap(c => c.items.hazards);
    foes = Array.from(this.sectors.values()).flatMap(c => c.items.foes);
  },
  animate(t, z) { for (const c of this.sectors.values()) if (c.root.visible) c.floes.update(t, z - c.root.position.z + 18, calm); }
};
const Endless = {
  state: null, session: null, ranked: false, target: 0, clock: EndlessCore.clock(), previous: null,
  pausedAt: 0, token: 0, finishing: false, pendingRanked: false,
  records: { practice: 0, ranked: 0 },
  recordKey() { return 'mungchyeo-endless:' + EndlessCore.RULES.version; },
  load() { try { this.records.practice = Number(JSON.parse(localStorage.getItem(this.recordKey()) || '{}').practice) || 0; } catch (_) {} },
  loadRanked(user) {
    this.recordUser = user || null; this.records.ranked = 0;
    try { if (user) this.records.ranked = Number(localStorage.getItem(this.recordKey() + ':ranked:' + user)) || 0; } catch (_) {}
  },
  saveRecords() { try {
    localStorage.setItem(this.recordKey(), JSON.stringify({ practice: this.records.practice }));
    if (this.recordUser) localStorage.setItem(this.recordKey() + ':ranked:' + this.recordUser, String(this.records.ranked));
  } catch (_) {} },
  async start(ranked) {
    const token = ++this.token; this.pendingRanked = false; OnlineUI.busy(true); OnlineUI.message('');
    try {
      let run = null;
      if (ranked) {
        await Account.ensureGuest();
        if (Account.needNick || !Account.nickname) { this.pendingRanked = true; updateNick(); return; }
        run = await Account.request('runs/start', { requestId: this.requestId || (this.requestId = crypto.randomUUID()) });
        if (run.version !== EndlessCore.RULES.version || run.tick !== 0 || run.status !== 'active') throw new Error('새 코스로 시작해 주세요.');
      }
      if (token !== this.token) return;
      this.requestId = null; this.ranked = ranked; this.finishing = false; this.target = 0; this.clock.reset(); this.freshFrame = true;
      this.state = EndlessCore.create(run ? run.seed : EndlessCore.dailySeed(EndlessCore.dayAt()));
      this.previous = { x: 0, distance: 0 };
      this.session = run ? new OnlineRun(run, Account.user.id, (p, b) => Account.request(p, b), () => OnlineUI.connection()) : null;
      G.mode = 'endless'; G.state = 'loading'; G.fight = null; G.pending = null; G.count = this.state.count; G.x = G.z = G.t = 0;
      player.resetImpact(); Combat.reset(); player.setValue(this.state.count, { instant: true }); player.hop = 1;
      player.logicalLayout = EndlessCore.formation(this.state.count); camPos.set(0, 9, 12);
      EndlessScene.init(this.state); Sfx.ensure(); OnlineUI.play();
      // Let the first draw upload geometry and compile shaders before starting the simulation clock.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (token !== this.token) return;
      G.state = 'running'; this.freshFrame = true;
      if (document.hidden) this.pause();
    } catch (e) {
      const messages = { not_configured: '온라인 랭킹은 준비 중이에요.', profile_required: '먼저 닉네임을 정해 주세요.', rate_limited: '잠시 쉬었다가 다시 시작해 주세요.', sign_in_required: '로그인을 다시 확인해 주세요.' };
      OnlineUI.message(messages[e.message] || (e.status ? '온라인에 연결하지 못했어요. 연습은 바로 시작할 수 있어요.' : e.message));
    } finally { if (token === this.token) OnlineUI.busy(false); }
  },
  step(dt) {
    if (G.state !== 'running' || !this.state) return;
    // Scene creation and paused time precede the run's first simulation frame.
    if (this.freshFrame) { this.freshFrame = false; dt = 0; }
    const ok = this.clock.advance(dt, () => {
      const s = this.state; this.previous = { x: s.x, distance: s.distance };
      if (keys.l || keys.r) this.target = Math.max(-4400, Math.min(4400, s.x + ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) * 150));
      const input = Math.round(this.target); EndlessCore.step(s, input, e => this.event(e)); this.session?.record(input);
      if (s.finished) { this.end('death'); return false; }
      return true;
    });
    if (!ok) { this.pause(); $('pauseText').textContent = '잠시 화면이 멈춰 게임을 쉬어 두었어요.'; }
    this.present();
  },
  present() {
    const s = this.state; if (!s) return;
    EndlessScene.sync(s);
    const a = this.clock.alpha, old = this.previous || s;
    G.x = (old.x + (s.x - old.x) * a) / 1000;
    G.z = EndlessScene.origin - (old.distance + (s.distance - old.distance) * a) / 1000;
    G.t = s.tick / EndlessCore.RULES.hz; G.count = s.count;
    player.tiltT = Math.max(-1, Math.min(1, (s.x - old.x) / 150)); player.cx = G.x; player.cz = G.z;
    if (player.value !== s.count) { player.setValue(s.count); player.logicalLayout = EndlessCore.formation(s.count); }
    G.fight = s.fight ? foes.find(f => f.id === s.fight.event.id) || null : null;
    OnlineUI.hud();
  },
  event(e) {
    const foe = e.event && foes.find(f => f.id === e.event.id);
    if (e.type === 'gate') { floater(e.pick.op + e.pick.v, false); player.jump = 1; Sfx.good(); }
    if (e.type === 'hazard' && e.lost) { player.flinch = 1; Sfx.bad(); for (let i = 0; i < Math.min(e.lost, 5); i++) Fx.kill(G.x + (i - 2) * .3, G.z, e.event.type === 'pit'); }
    if (e.type === 'battle' && foe) Combat.begin(player, foe.view);
    if (e.type === 'hit' && foe) Combat.damage(player, foe.view, e.lost);
    if (e.type === 'victory' && foe) { Combat.finish(player, foe.view); if (e.event.boss) floater('+500', false); }
    if (e.type === 'clean') floater('무피해 +200', false);
  },
  pause() {
    if (G.mode !== 'endless' || G.state !== 'running') return;
    G.state = 'paused'; this.pausedAt = Date.now(); this.clock.reset(); keys.l = keys.r = false;
    $('pauseText').textContent = '준비되면 다시 달려요.'; $('endlessPause').hidden = false; $('resumeEndless').focus();
    this.session?.flush(true).catch(() => {});
  },
  resume() {
    if (G.state !== 'paused') return;
    if (this.session && Date.now() - this.pausedAt > EndlessCore.RULES.idleMs) this.session.invalidate('오래 쉬어 연습 기록으로 전환했어요.');
    this.clock.reset(); this.freshFrame = true; G.state = 'running'; $('endlessPause').hidden = true;
  },
  async end(reason) {
    if (this.finishing) return; this.finishing = true; this.endReason = reason;
    G.state = 'lose'; this.clock.reset(); this.present(); $('endlessPause').hidden = true;
    const s = this.state; this.records.practice = Math.max(Number(this.records.practice) || 0, s.score); this.saveRecords();
    if (!s.count) Sfx.lose(); OnlineUI.result();
    if (this.session?.valid) await this.submit();
  },
  async submit() {
    const session = this.session; if (!session?.valid) return;
    $('retrySubmit').hidden = true;
    try {
      const result = await session.finish(this.endReason === 'quit' ? 'quit' : 'death');
      if (this.session !== session) return;
      this.records.ranked = Math.max(Number(this.records.ranked) || 0, result.score); this.saveRecords();
      OnlineUI.connection();
    } catch (_) { if (this.session !== session) return; OnlineUI.connection(); $('retrySubmit').hidden = !session.valid; }
  },
  exit() {
    this.token++; this.pendingRanked = false; this.requestId = null;
    this.session?.invalidate(''); this.session = null; this.state = null; this.finishing = false;
    if (G.mode === 'endless') EndlessScene.clear();
    player.logicalLayout = null; G.mode = 'stage'; OnlineUI.hide();
  }
};
Endless.load();
