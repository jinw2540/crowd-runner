// Sound effects synthesised with Web Audio.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Sound ---------- */
const Sfx = {
  ctx: null, lastHit: 0, lastBrawl: -Infinity, brawlBeat: 0,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f, d, type, v, slide) {
    if (Save.data.muted || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.ctx.destination);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t); o.stop(t + d);
  },
  good() { this.tone(520, 0.12, 'triangle', 0.14, 400); },
  bad() { this.tone(220, 0.2, 'sawtooth', 0.08, -120); },
  hit() { const n = performance.now(); if (n - this.lastHit < 60) return; this.lastHit = n; this.tone(160 + Math.random() * 60, 0.06, 'square', 0.05); },
  brawl(final, strong) {
    if (Save.data.muted || !this.ctx) return;
    const now = performance.now(); if (!final && now - this.lastBrawl < 140) return;
    this.lastBrawl = now;
    const pitch = [165, 210, 140, 185][this.brawlBeat++ % 4] * (strong ? .8 : 1);
    this.tone(pitch, final ? .13 : .085, 'triangle', final ? .11 : .085, -pitch * .6);
    this.tone(pitch * 4.2, .035, 'sine', .025, -pitch * 2.5);
    if (final) this.tone(640, .16, 'triangle', .035, 240);
  },
  plop() { const n = performance.now(); if (n - this.lastHit < 60) return; this.lastHit = n; this.tone(520, 0.14, 'sine', 0.09, -380); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.13), i * 110)); },
  lose() { this.tone(300, 0.5, 'sawtooth', 0.09, -220); }
};

