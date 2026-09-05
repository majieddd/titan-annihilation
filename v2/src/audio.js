import { clamp } from './util.js';

export class GameAudio {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.6; this.lastPlay = new Map(); this.playedThisFrame = 0; this.listener = null; }
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) { this.enabled = false; return; }
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 6;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.startAmbient();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  frame() { this.playedThisFrame = 0; }
  can(key, gap = 0.05, vol = 1) {
    if (!this.ctx || !this.enabled || vol < 0.02 || this.playedThisFrame > 14) return false;
    const t = this.ctx.currentTime; const last = this.lastPlay.get(key) || -1;
    if (t - last < gap) return false; this.lastPlay.set(key, t); this.playedThisFrame++; return true;
  }
  /** volume falloff by distance from camera anchor */
  spatial(p) { if (!this.listener) return 1; const d = this.listener.distanceTo(p); return clamp(1 - d / 520, 0, 1) ** 1.6 * (this.camDist ? clamp(1.2 - this.camDist / 900, 0.15, 1) : 1); }
  noise(dur, filterType, f0, f1, gain, q = 1) {
    const ctx = this.ctx; const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(f0, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(ctx.currentTime, Math.random() * 1.5); src.stop(ctx.currentTime + dur + 0.05);
  }
  tone(type, f0, f1, dur, gain, delay = 0) {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = type; const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  laser(p) { const v = this.spatial(p); if (!this.can('laser', 0.04, v)) return; this.tone('sawtooth', 1400 + Math.random() * 400, 260, 0.13, 0.08 * v); this.tone('square', 700, 180, 0.09, 0.04 * v); }
  cannon(p, big = 1) { const v = this.spatial(p); if (!this.can('cannon' + (big > 1.5 ? 'b' : ''), 0.06, v)) return; this.noise(0.22 * big, 'lowpass', 900 * big, 120, 0.35 * v); this.tone('sine', 130 * big, 45, 0.25 * big, 0.3 * v); }
  missile(p) { const v = this.spatial(p); if (!this.can('missile', 0.08, v)) return; this.noise(0.4, 'bandpass', 500, 2600, 0.14 * v, 2); }
  beam(p) { const v = this.spatial(p); if (!this.can('beam', 0.1, v)) return; this.tone('sine', 220, 900, 0.32, 0.16 * v); this.tone('sawtooth', 110, 60, 0.3, 0.08 * v); }
  lightning(p) { const v = this.spatial(p); if (!this.can('light', 0.09, v)) return; this.noise(0.25, 'highpass', 1800, 400, 0.22 * v, 0.5); this.tone('square', 90, 40, 0.18, 0.12 * v); }
  flame(p) { const v = this.spatial(p); if (!this.can('flame', 0.25, v)) return; this.noise(0.5, 'lowpass', 1400, 600, 0.12 * v, 0.7); }
  stomp(p) { const v = this.spatial(p); if (!this.can('stomp', 0.3, v)) return; this.tone('sine', 60, 25, 0.9, 0.7 * v); this.noise(0.5, 'lowpass', 500, 60, 0.5 * v); }
  explosion(p, size = 1) { const v = this.spatial(p); const key = size > 3 ? 'explbig' : 'expl'; if (!this.can(key, size > 3 ? 0.2 : 0.08, v)) return; const s = Math.min(3, Math.sqrt(size)); this.noise(0.5 * s + 0.3, 'lowpass', 2400, 80, (0.35 + 0.15 * s) * v, 0.8); this.tone('sine', 80 * s, 28, 0.6 * s, 0.45 * v); if (size > 3) { this.noise(3, 'lowpass', 400, 40, 0.5 * v); this.tone('sine', 40, 20, 2.5, 0.6 * v); } }
  uber(p) { const v = this.spatial(p); if (!this.can('uber', 0.3, v)) return; this.tone('sawtooth', 200, 40, 0.5, 0.35 * v); this.noise(0.5, 'lowpass', 1500, 100, 0.4 * v); }
  build(p) { const v = this.spatial(p) * 0.5; if (!this.can('build', 0.5, v)) return; this.tone('sine', 660, 660, 0.09, 0.12 * v); this.tone('sine', 880, 880, 0.14, 0.12 * v, 0.1); }
  click() { if (!this.can('click', 0.03)) return; this.tone('square', 1500, 900, 0.03, 0.05); }
  place() { if (!this.can('place', 0.05)) return; this.tone('sine', 520, 780, 0.08, 0.1); }
  alert(bad = true) { if (!this.can('alert', 1.5)) return; for (let i = 0; i < 3; i++) this.tone('square', bad ? 520 : 780, bad ? 440 : 780, 0.12, 0.08, i * 0.16); }
  victory() { if (!this.ctx) return; [523, 659, 784, 1046].forEach((f, i) => this.tone('sine', f, f, 0.5, 0.2, i * 0.18)); }
  defeat() { if (!this.ctx) return; [440, 392, 330, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.7, 0.12, i * 0.3)); }
  startAmbient() {
    const ctx = this.ctx; const g = ctx.createGain(); g.gain.value = 0.05; g.connect(this.master);
    for (const f of [52, 52.6, 78]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.35; o.connect(og); og.connect(g); o.start(); }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; const ng = ctx.createGain(); ng.gain.value = 0.35;
    src.connect(f); f.connect(ng); ng.connect(g); src.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  }
}

Object.assign(GameAudio.prototype, {
  nukeLaunch(p) { const v = Math.max(0.4, this.spatial(p)); if (!this.can('nukel', 0.5, v)) return; this.noise(2.5, 'lowpass', 300, 1800, 0.5 * v, 0.7); this.tone('sawtooth', 60, 140, 2.0, 0.25 * v); },
  nukeBlast(p) { const v = Math.max(0.6, this.spatial(p)); if (!this.can('nukeb', 1.0)) return; this.noise(4.5, 'lowpass', 3000, 40, 0.9 * v, 0.6); this.tone('sine', 55, 18, 5.0, 0.9 * v); this.tone('sine', 110, 30, 3.0, 0.4 * v); this.noise(8, 'lowpass', 400, 60, 0.35 * v); },
  siren() { if (!this.ctx || !this.can('siren', 3)) return; for (let i = 0; i < 3; i++) { this.tone('sawtooth', 380, 760, 0.6, 0.12, i * 0.8); this.tone('sawtooth', 760, 380, 0.6, 0.12, i * 0.8 + 0.4); } },
  teleport(p) { const v = this.spatial(p); if (!this.can('tele', 0.15, v)) return; this.tone('sine', 300, 1600, 0.35, 0.12 * v); this.tone('triangle', 1600, 400, 0.4, 0.08 * v, 0.1); },
  transit(p) { const v = this.spatial(p); if (!this.can('transit', 0.3, v)) return; this.noise(1.2, 'bandpass', 200, 1200, 0.18 * v, 1.5); this.tone('sine', 120, 480, 1.0, 0.1 * v); },
});
