// Everything you hear is synthesized live with the Web Audio API:
// a dreamy lo-fi music box over soft pads, bass, a brushed beat and vinyl
// crackle, plus chimes and sparkles for every touch. No audio files.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const BPM = 74;

// 8-bar progression in C major: Fmaj7 – Em7 – Am7 – C/G – Dm7 – Em7 – Fmaj7 – G7sus
const CHORDS = [
  { pad: [53, 57, 60, 64], bass: 41, arp: [65, 69, 72, 76] },
  { pad: [52, 55, 59, 62], bass: 40, arp: [64, 67, 71, 74] },
  { pad: [57, 60, 64, 67], bass: 45, arp: [69, 72, 76, 79] },
  { pad: [55, 60, 64, 67], bass: 43, arp: [67, 72, 76, 79] },
  { pad: [50, 53, 57, 60], bass: 38, arp: [62, 65, 69, 72] },
  { pad: [52, 55, 59, 62], bass: 40, arp: [64, 67, 71, 74] },
  { pad: [53, 57, 60, 64], bass: 41, arp: [65, 69, 72, 76] },
  { pad: [55, 60, 62, 65], bass: 43, arp: [67, 72, 74, 77] },
];

// Melody: per bar, [eighth-note step, midi, length in eighths]
const MELODY = [
  // A — tender
  [[0, 81, 3], [3, 79, 1], [4, 81, 1], [5, 84, 3]],
  [[0, 83, 3], [3, 81, 1], [4, 79, 2], [6, 76, 2]],
  [[0, 84, 2], [2, 83, 1], [3, 81, 1], [4, 76, 3], [7, 79, 1]],
  [[0, 79, 4], [4, 76, 1], [5, 74, 1], [6, 76, 2]],
  [[0, 77, 2], [2, 81, 2], [4, 86, 3], [7, 84, 1]],
  [[0, 83, 2], [2, 79, 2], [4, 88, 3], [7, 86, 1]],
  [[0, 84, 3], [3, 81, 1], [4, 79, 1], [5, 81, 1], [6, 77, 2]],
  [[0, 74, 2], [2, 76, 2], [4, 79, 4]],
  // B — sparkling, an octave of dreams higher
  [[0, 88, 2], [2, 84, 1], [3, 81, 1], [4, 84, 2], [6, 88, 1], [7, 89, 1]],
  [[0, 91, 3], [3, 88, 1], [4, 86, 2], [6, 83, 2]],
  [[0, 84, 1], [1, 88, 1], [2, 93, 3], [5, 91, 1], [6, 88, 2]],
  [[0, 91, 2], [2, 88, 2], [4, 86, 1], [5, 84, 1], [6, 86, 2]],
  [[0, 89, 2], [2, 88, 1], [3, 86, 1], [4, 81, 3], [7, 84, 1]],
  [[0, 83, 2], [2, 86, 1], [3, 88, 1], [4, 91, 3], [7, 88, 1]],
  [[0, 93, 3], [3, 91, 1], [4, 89, 1], [5, 88, 1], [6, 84, 2]],
  [[0, 86, 2], [2, 83, 2], [4, 84, 1], [5, 86, 1], [6, 79, 2]],
];

const PENTA = [77, 79, 81, 84, 86, 89, 91, 93, 96, 98];
const HIGH = [96, 98, 101, 103, 105, 108];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.playing = false;
    this.last = Object.create(null);
  }

  get ready() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture (iOS/Android autoplay rules). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch (e) {
        /* not supported */
      }
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.buildGraph();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    // tiny silent buffer – fully unlocks older iOS Safari
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
    return true;
  }

  buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.6, 2.4);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.62;
    this.reverb.connect(revOut).connect(this.master);

    // music bus: lowpass + gentle tape saturation for the lo-fi warmth
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    lp.Q.value = 0.4;
    const sat = ctx.createWaveShaper();
    sat.curve = this.satCurve(1.5);
    sat.oversample = '2x';
    this.musicBus.connect(lp).connect(sat).connect(this.master);
    this.musicDry = ctx.createGain();
    this.musicDry.connect(this.musicBus);
    this.musicWet = ctx.createGain();
    this.musicWet.gain.value = 0;
    this.musicWet.connect(this.reverb);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.sfxWet = ctx.createGain();
    this.sfxWet.gain.value = 0.55;
    this.sfxWet.connect(this.reverb);

    this.noise = this.makeNoise(2);
    this.crackleBuf = this.makeCrackle(4);
  }

  makeIR(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      const pre = Math.floor(rate * 0.018);
      for (let i = pre; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.5 - 0.38 * t);
        d[i] = lp * Math.pow(1 - t, decay) * 1.6;
      }
    }
    return buf;
  }

  satCurve(k) {
    const n = 1024;
    const c = new Float32Array(n);
    const norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / norm;
    }
    return c;
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeCrackle(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.012;
      if (Math.random() < 0.0004) {
        const amp = 0.2 + Math.random() * 0.6;
        for (let j = 0; j < 30 && i + j < len; j++) d[i + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / 6);
      }
    }
    return buf;
  }

  // ------------------------------------------------------------- voices

  /** Music-box tine: sine fundamental, soft octave, metallic shimmer. */
  box(time, midi, vel, dry, wet) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const dur = Math.max(0.9, 2.7 - (midi - 60) * 0.045);
    const wow = Math.sin(time * Math.PI * 2 * 0.45) * 6 + (Math.random() - 0.5) * 4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(vel, time + 0.004);
    env.gain.exponentialRampToValueAtTime(vel * 0.32, time + 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    env.connect(dry);
    if (wet) env.connect(wet);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    o1.detune.value = wow;
    o1.connect(env);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.28, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.4);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    o2.detune.value = wow;
    o2.connect(g2).connect(env);

    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.12, time);
    g3.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = Math.min(f * 5.43, ctx.sampleRate * 0.45);
    o3.connect(g3).connect(env);

    const end = time + dur + 0.05;
    for (const o of [o1, o2, o3]) {
      o.start(time);
      o.stop(end);
    }
  }

  pad(time, notes, dur) {
    const ctx = this.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 0.6;
    filt.frequency.setValueAtTime(480, time);
    filt.frequency.linearRampToValueAtTime(1150, time + dur * 0.5);
    filt.frequency.linearRampToValueAtTime(620, time + dur + 1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.05, time + 1.1);
    env.gain.setValueAtTime(0.05, time + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur + 1.5);
    filt.connect(env);
    env.connect(this.musicDry);
    env.connect(this.musicWet);
    for (const m of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.16;
        o.connect(g).connect(filt);
        o.start(time);
        o.stop(time + dur + 1.6);
      }
    }
  }

  bass(time, midi, dur, vel = 0.2) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(vel, time + 0.02);
    env.gain.exponentialRampToValueAtTime(vel * 0.45, time + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    lp.connect(env).connect(this.musicDry);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const s = ctx.createOscillator();
    s.type = 'sine';
    s.frequency.value = mtof(midi - 12);
    const sg = ctx.createGain();
    sg.gain.value = 0.7;
    o.connect(lp);
    s.connect(sg).connect(lp);
    for (const x of [o, s]) {
      x.start(time);
      x.stop(time + dur + 0.05);
    }
  }

  kick(time, vel = 0.32) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(115, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    o.connect(g).connect(this.musicDry);
    o.start(time);
    o.stop(time + 0.36);
  }

  noiseHit(time, { freq, type = 'bandpass', q = 0.8, vel = 0.1, decay = 0.15, dest, wet }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    src.connect(f).connect(g).connect(dest);
    if (wet) g.connect(wet);
    src.start(time, Math.random() * 1.5, decay + 0.05);
  }

  // ------------------------------------------------------------- sequencer

  startMusic() {
    if (!this.ctx) return;
    this.on = true;
    if (this.playing) return;
    this.playing = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.bar = 0;
    this.step = 0;
    this.loops = 0;
    this.nextTime = now + 0.12;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
    this.musicBus.gain.linearRampToValueAtTime(0.62, now + 1.8);
    this.musicWet.gain.cancelScheduledValues(now);
    this.musicWet.gain.setValueAtTime(this.musicWet.gain.value, now);
    this.musicWet.gain.linearRampToValueAtTime(0.42, now + 1.8);

    this.crackleSrc = ctx.createBufferSource();
    this.crackleSrc.buffer = this.crackleBuf;
    this.crackleSrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const cg = ctx.createGain();
    cg.gain.value = 0.11;
    this.crackleSrc.connect(hp).connect(cg).connect(this.musicDry);
    this.crackleSrc.start();

    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stopMusic() {
    if (!this.ctx) return;
    this.on = false;
    if (!this.playing) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    for (const g of [this.musicBus.gain, this.musicWet.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.9);
    }
    clearInterval(this.timer);
    try {
      this.crackleSrc?.stop(now + 1);
    } catch (e) {
      /* already stopped */
    }
  }

  toggle() {
    if (this.playing) this.stopMusic();
    else this.startMusic();
    return this.playing;
  }

  schedule() {
    const ctx = this.ctx;
    if (!this.playing || ctx.state !== 'running') return;
    const s16 = 60 / BPM / 4;
    // if timers were throttled (background tab), skip ahead instead of bursting
    if (this.nextTime < ctx.currentTime - 0.25) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.16) {
      this.playStep(this.bar, this.step, this.nextTime, s16);
      this.nextTime += s16;
      if (++this.step === 16) {
        this.step = 0;
        this.bar = (this.bar + 1) % 16;
        if (this.bar === 0) this.loops++;
      }
    }
  }

  playStep(bar, step, time, s16) {
    const chord = CHORDS[bar % 8];
    const barDur = s16 * 16;
    const swing = step % 4 === 2 ? s16 * 0.2 : 0;
    const t = time + swing + (Math.random() - 0.5) * 0.008;
    const sectionB = bar >= 8;
    const drums = this.loops > 0 || bar >= 4;

    if (step === 0) {
      this.pad(time, chord.pad, barDur);
      this.bass(time, chord.bass, s16 * 7, 0.2);
    }
    if (step === 10 && drums) this.bass(t, chord.bass + (bar % 2 ? 7 : 12), s16 * 5, 0.11);

    if (step % 2 === 0) {
      const e = step / 2;
      for (const [s8, midi] of MELODY[bar]) {
        if (s8 === e) this.box(t, midi, 0.2 * (0.88 + Math.random() * 0.2), this.musicDry, this.musicWet);
      }
      // music-box comb arpeggio
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      if (sectionB || e % 2 === 0) {
        this.box(t + 0.004, chord.arp[order[e]] - (sectionB ? 0 : 12), sectionB ? 0.07 : 0.085, this.musicDry, this.musicWet);
      }
    }

    if (drums) {
      if (step === 0 || (step === 7 && bar % 2 === 1) || step === 10) this.kick(t, step === 0 ? 0.3 : 0.2);
      if (step === 4 || step === 12)
        this.noiseHit(t, { freq: 1900, q: 0.7, vel: 0.075, decay: 0.2, dest: this.musicDry, wet: this.musicWet });
      if (step % 2 === 0)
        this.noiseHit(t, { freq: 7800, type: 'highpass', q: 0.5, vel: 0.022 * (0.6 + Math.random() * 0.6), decay: 0.045, dest: this.musicDry });
    }
  }

  // ------------------------------------------------------------- effects

  gate(name, ms) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return false;
    const now = performance.now();
    if (now - (this.last[name] || 0) < ms) return false;
    this.last[name] = now;
    return true;
  }

  chime(xNorm = Math.random()) {
    if (!this.gate('chime', 60)) return;
    const t = this.ctx.currentTime + 0.005;
    const i = Math.max(0, Math.min(PENTA.length - 1, Math.round(xNorm * (PENTA.length - 1))));
    this.box(t, PENTA[i], 0.22, this.sfx, this.sfxWet);
    this.box(t + 0.09, PENTA[Math.min(PENTA.length - 1, i + 2)], 0.08, this.sfx, this.sfxWet);
  }

  sparkle() {
    if (!this.gate('sparkle', 85)) return;
    const t = this.ctx.currentTime + 0.003;
    this.box(t, HIGH[(Math.random() * HIGH.length) | 0], 0.045, this.sfx, this.sfxWet);
  }

  launch() {
    if (!this.gate('launch', 90)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.65);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.sfx);
    g.connect(this.sfxWet);
    o.start(t);
    o.stop(t + 0.75);
    this.noiseHit(t, { freq: 3500, type: 'highpass', vel: 0.02, decay: 0.5, dest: this.sfx });
  }

  boom(size = 1) {
    if (!this.gate('boom', 70)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.9);
    const g = ctx.createGain();
    const v = Math.min(0.32, 0.17 * size);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(f).connect(g).connect(this.sfx);
    g.connect(this.sfxWet);
    src.start(t, Math.random(), 1.4);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.22 * Math.min(1.4, size), t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(og).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.55);
    // a twinkle on top keeps it romantic rather than loud
    this.box(t + 0.05, HIGH[(Math.random() * 3) | 0], 0.05, this.sfx, this.sfxWet);
  }

  crackle() {
    if (!this.gate('crackle', 120)) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      this.noiseHit(t + Math.random() * 0.5, { freq: 4000 + Math.random() * 3000, type: 'highpass', vel: 0.035, decay: 0.03, dest: this.sfx });
    }
  }

  plop(xNorm = 0.5) {
    if (!this.gate('plop', 80)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.sfx);
    g.connect(this.sfxWet);
    o.start(t);
    o.stop(t + 0.2);
    this.last.chime = 0;
    this.chime(xNorm);
  }

  arpeggio(notes, gap = 0.085, vel = 0.14) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    notes.forEach((m, i) => this.box(t + i * gap, m, vel * (1 - i * 0.03), this.sfx, this.sfxWet));
  }

  wishUp() {
    this.arpeggio([77, 81, 84, 88, 91, 93, 96, 100], 0.11, 0.15);
  }

  wishArrive() {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    for (const [i, m] of [89, 93, 96, 100, 105].entries()) this.box(t + i * 0.03, m, 0.12, this.sfx, this.sfxWet);
  }

  together() {
    if (!this.on || !this.ctx) return;
    this.arpeggio([72, 76, 79, 83, 84, 88, 91, 95, 96, 100, 103, 108], 0.07, 0.13);
    const t = this.ctx.currentTime;
    for (const d of [0.9, 1.08, 1.9, 2.08]) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(70, t + d);
      o.frequency.exponentialRampToValueAtTime(38, t + d + 0.12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.linearRampToValueAtTime(0.24, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g).connect(this.sfx);
      o.start(t + d);
      o.stop(t + d + 0.25);
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.on) this.ctx.resume();
  }
}
