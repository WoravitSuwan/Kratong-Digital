// Loy Krathong — bootstrap, layout, render loop, adaptive quality and input.

import { clamp, rand, pick } from './util.js';
import { buildLibrary, sanitizeHandle } from './sprites.js';
import { Sky } from './sky.js';
import { Lanterns } from './lanterns.js';
import { Water } from './water.js';
import { Krathongs } from './krathong.js';
import { Fireworks, Pool, FIREWORK_TYPES, PALETTE_NAMES } from './particles.js';
import { AudioEngine } from './audio.js';
import { initUI } from './ui.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const params = new URLSearchParams(location.search);

// Quality ladder: we start sharp and step down only if the device struggles.
const QUALITY = [
  { dpr: 3, fx: 1, water: 1 },
  { dpr: 2.5, fx: 0.9, water: 1.05 },
  { dpr: 2, fx: 0.8, water: 1.12 },
  { dpr: 1.6, fx: 0.66, water: 1.25 },
  { dpr: 1.3, fx: 0.52, water: 1.4 },
  { dpr: 1, fx: 0.42, water: 1.6 },
];

class Director {
  constructor() {
    this.q = [];
    this.t = 0;
  }
  after(delay, fn) {
    this.q.push({ at: this.t + delay, fn });
  }
  update(dt) {
    this.t += dt;
    for (let i = this.q.length - 1; i >= 0; i--) {
      if (this.q[i].at <= this.t) {
        const e = this.q.splice(i, 1)[0];
        e.fn();
      }
    }
  }
}

const handle = (v, fallback) => sanitizeHandle((v || '').replace(/^@+/, ''), fallback);

const app = {
  canvas,
  ctx,
  W: 0,
  H: 0,
  dpr: 1,
  t: 0,
  q: 1,
  level: 0,
  waterDensity: 1,
  workMs: 0,
  started: false,
  haptics: true,
  names: { her: handle(params.get('her'), 'jvstjahh'), him: handle(params.get('him'), '_f1rst.suwann') },
  director: new Director(),
  audio: new AudioEngine(),
};

// starting quality
const forcedQ = params.get('q');
let qualityLocked = false;
if (forcedQ !== null && QUALITY[+forcedQ]) {
  app.level = +forcedQ;
  qualityLocked = true;
} else {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  if (cores <= 4) app.level = 2;
  if (mem <= 2) app.level = 3;
}

app.sky = new Sky(app);
app.lanterns = new Lanterns(app);
app.water = new Water(app);
app.krathongs = new Krathongs(app);
app.fw = new Fireworks(app);
app.fxMid = new Pool(app, 900);
app.fxTop = new Pool(app, 1200);

// ------------------------------------------------------------------ layout
const safeProbe = document.createElement('div');
safeProbe.style.cssText =
  'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px);padding-top:env(safe-area-inset-top,0px)';
document.body.appendChild(safeProbe);

function geometry() {
  const { W, H } = app;
  const portrait = H >= W * 1.05;
  const cs = getComputedStyle(safeProbe);
  const safeB = parseFloat(cs.paddingBottom) || 0;
  const tall = H / W >= 1.9;
  app.horizonY = Math.round(H * (portrait ? (tall ? 0.56 : 0.53) : 0.58));
  app.Wk = clamp(Math.min(W * 0.38, H * (tall ? 0.205 : 0.19)), 88, 210);
  const bottomUI = 92 + safeB;
  let wy = Math.min(H * (portrait ? 0.775 : 0.8), H - bottomUI - app.Wk * 0.2);
  wy = Math.max(wy, app.horizonY + (H - app.horizonY) * 0.42);
  app.waterY = Math.round(wy);
}

function layout(force = false) {
  const r = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width));
  const H = Math.max(1, Math.round(r.height));
  const Q = QUALITY[app.level];
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  if (!force && W === app.W && H === app.H && dpr === app.dpr) return;
  app.W = W;
  app.H = H;
  app.dpr = dpr;
  app.q = Q.fx;
  app.waterDensity = Q.water;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  geometry();
  app.S = buildLibrary(dpr);
  app.sky.layout();
  app.krathongs.layout();
  app.water.layout();
  app.lanterns.layout();
  app.fw.setQuality(app.q);
  app.fxMid.cap = Math.round(app.fxMid.max * clamp(app.q, 0.4, 1));
  app.fxTop.cap = Math.round(app.fxTop.max * clamp(app.q, 0.4, 1));
}

let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => layout(), 120);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

// ------------------------------------------------------------------ actions
function launchRandom(x, y, scale = 1, quiet = false) {
  const type = pick(FIREWORK_TYPES);
  const pal = type === 'willow' ? 'gold' : type === 'sakura' ? 'sakura' : pick(PALETTE_NAMES);
  app.fw.launch(x, y, type, pal, scale, quiet);
}

function finale(delay) {
  const d = app.director;
  const at = (s, fn) => d.after(delay + s, fn);
  const X = (f) => app.W * f;
  const Y = (f) => app.horizonY * f;
  at(0.0, () => app.fw.launch(X(0.5), Y(0.62), 'heart', 'love', 1.15));
  at(0.7, () => app.fw.launch(X(0.24), Y(0.3), 'heart', 'dream', 0.85));
  at(1.2, () => app.fw.launch(X(0.77), Y(0.33), 'heart', 'love', 0.85));
  at(1.6, () => app.sky.shootBurst(4));
  at(2.1, () => app.fw.launch(X(0.5), Y(0.24), 'sakura', 'sakura', 1.05));
  at(2.8, () => app.fw.launch(X(0.3), Y(0.5), 'willow', 'gold', 0.95));
  at(3.1, () => app.fw.launch(X(0.7), Y(0.47), 'willow', 'gold', 0.95));
  at(4.0, () => app.fw.launch(X(0.5), Y(0.58), 'bigheart', 'ours', 1.4));
  at(4.6, () => app.sky.shootBurst(3));
  at(5.4, () => app.fw.launch(X(0.18), Y(0.22), 'peony', 'pastel', 0.8));
  at(5.7, () => app.fw.launch(X(0.83), Y(0.2), 'ring', 'dream', 0.8));
  at(6.3, () => app.fw.launch(X(0.5), Y(0.2), 'heart', 'ours', 1.0));
}

function floatTogether() {
  const first = !app.krathongs.together;
  app.krathongs.setTogether();
  app.audio.together();
  if (navigator.vibrate) navigator.vibrate([12, 70, 12]);
  finale(first ? 1.4 : 0.15);
  return first;
}

async function releaseWish(text) {
  await app.lanterns.addWish(text);
  app.audio.wishUp();
  const { W } = app;
  app.fxTop.sparkle(W / 2, app.waterY - app.Wk * 0.7, 30, ['gold', 'rose', 'cream', 'white'], 80, { g: 10 });
  app.water.addRipple(W / 2, app.waterY + 8, 'gold', 1, 1.3);
}

app.onWishArrive = () => {
  const { sky } = app;
  sky.moonFlash = 1;
  app.fxTop.sparkle(sky.moonX, sky.moonY, 70, ['gold', 'cream', 'rose', 'white', 'sakura'], sky.moonR * 2.2, {
    g: 12,
    life: [1, 2.1],
    scale: 1.1,
  });
  app.fxTop.hearts(sky.moonX, sky.moonY + sky.moonR * 0.4, 7, ['pink', 'rose', 'white', 'gold'], sky.moonR * 0.6);
  app.audio.wishArrive();
  ui.toast('คำอธิษฐานลอยไปถึงดวงจันทร์แล้วนะ 🌕✨', 3200);
};

function welcome() {
  const { W, horizonY } = app;
  app.fw.launch(W * 0.5, horizonY * 0.62, 'heart', 'love', 1.05);
  app.director.after(0.9, () => app.fw.launch(W * 0.3, horizonY * 0.3, 'sakura', 'sakura', 0.8, true));
  app.director.after(1.5, () => app.fw.launch(W * 0.72, horizonY * 0.28, 'willow', 'gold', 0.8, true));
  app.director.after(0.4, () => app.sky.shoot({ speed: 1.1 }));
}

const ui = initUI(app, { together: floatTogether, wish: releaseWish, welcome });

// ------------------------------------------------------------------ input
const DUST = ['pink', 'lavender', 'cyan', 'gold', 'sakura', 'mint', 'peach'];
const pointers = new Map();

function tap(x, y) {
  const { W, horizonY: hy } = app;
  const k = app.krathongs.hitTest(x, y);
  if (k) {
    app.krathongs.poke(k);
    app.audio.chime(x / W);
    return;
  }
  if (y < hy - 4) {
    launchRandom(x, y, rand(0.85, 1.1));
    app.fxTop.sparkle(x, y, 10, ['white', 'cream', 'sakura'], 45, { g: 0, life: [0.3, 0.6] });
    app.audio.chime(1 - y / hy);
  } else {
    const col = pick(['cyan', 'pink', 'lavender', 'gold', 'mint']);
    app.water.addRipple(x, y, col, 1, 1);
    app.fxMid.sparkle(x, y, 14, [col, 'white'], 55, { g: 40, lift: -45, life: [0.5, 1] });
    if (Math.random() < 0.62) app.water.addFloater(x, y);
    else app.lanterns.addMini(x, y);
    app.audio.plop(x / W);
  }
}

function local(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener('pointerdown', (e) => {
  if (!app.started) return;
  const [x, y] = local(e);
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    /* ignore */
  }
  pointers.set(e.pointerId, { x0: x, y0: y, x, y, t0: performance.now(), moved: false, travel: 0, rip: 0, hue: (Math.random() * DUST.length) | 0 });
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = local(ev);
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (!p.moved && Math.hypot(x - p.x0, y - p.y0) > 10) p.moved = true;
    if (p.moved && d > 0.5) {
      const steps = Math.min(10, Math.ceil(d / 7));
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const col = DUST[(p.hue + Math.floor((p.travel + d * f) / 90)) % DUST.length];
        app.fxTop.dust(p.x + dx * f, p.y + dy * f, col, dx * 30, dy * 30);
      }
      p.travel += d;
      p.rip += d;
      if (y > app.horizonY && p.rip > 70) {
        p.rip = 0;
        app.water.addRipple(x, y, DUST[p.hue % DUST.length], 0.5, 0.8);
      }
      app.audio.sparkle();
    }
    p.x = x;
    p.y = y;
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p || e.type === 'pointercancel') return;
  if (!p.moved && performance.now() - p.t0 < 650) tap(p.x, p.y);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// ------------------------------------------------------------------ loop
let ambientT = rand(7, 11);
function ambient(dt) {
  if (!app.started) return;
  ambientT -= dt;
  if (ambientT <= 0) {
    ambientT = rand(9, 16);
    launchRandom(rand(0.15, 0.85) * app.W, rand(0.18, 0.55) * app.horizonY, rand(0.6, 0.85), true);
  }
}

function update(dt) {
  app.t += dt;
  const t = app.t;
  app.director.update(dt);
  app.sky.update(dt);
  app.lanterns.update(dt, t);
  app.krathongs.update(dt, t);
  app.water.update(dt, t);
  app.fw.update(dt);
  app.fxMid.update(dt);
  app.fxTop.update(dt);
  ambient(dt);

  const w = app.water;
  const hy = app.horizonY;
  w.beginLights();
  app.krathongs.addLights(w);
  for (const f of app.fw.flashes) {
    const k = f.life / f.max;
    if (f.y < hy) w.addLight(f.x, hy + (hy - f.y) * 0.6, f.R * 1.1, f.R * 0.85, 0.9 * f.power * k * k, app.S.soft[f.col]);
  }
  app.lanterns.addLights(w);
  w.addOwnLights();
}

function render() {
  const { dpr, t, W, horizonY: hy } = app;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  app.sky.drawBackground(ctx);
  app.sky.drawStars(ctx, t);
  app.sky.drawMoon(ctx, t);
  app.lanterns.drawLayer(ctx, 0, t);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, hy);
  ctx.clip();
  app.fw.drawFlashes(ctx);
  app.sky.drawShooting(ctx);
  app.fw.draw(ctx);
  ctx.restore();

  app.lanterns.drawLayer(ctx, 1, t);
  app.water.draw(ctx, t, (c) => app.krathongs.drawReflections(c, t));
  app.krathongs.drawAura(ctx, t);
  app.fxMid.draw(ctx);
  app.krathongs.draw(ctx, t);
  app.water.drawFireflies(ctx, t);
  app.lanterns.drawLayer(ctx, 2, t);
  app.lanterns.drawLayer(ctx, 3, t);
  app.lanterns.drawWishes(ctx, t);
  app.fxTop.draw(ctx);
}

const perf = { acc: 0, n: 0, grace: 2.5 };
function monitor(ms) {
  if (qualityLocked || ms > 250) return;
  if (perf.grace > 0) {
    perf.grace -= ms / 1000;
    return;
  }
  perf.acc += ms;
  if (++perf.n < 80) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0;
  perf.n = 0;
  if (avg > 23 && app.level < QUALITY.length - 1) {
    app.level++;
    layout(true);
    perf.grace = 2;
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const ms = now - last;
  last = now;
  monitor(ms);
  const dt = clamp(ms / 1000, 0.001, 0.05);
  const t0 = performance.now();
  update(dt);
  render();
  app.workMs += (performance.now() - t0 - app.workMs) * 0.05;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.audio.suspend();
  else {
    app.audio.resume();
    last = performance.now();
  }
});

layout(true);
requestAnimationFrame((now) => {
  last = now;
  frame(now);
});

// tiny debugging / capture hook
window.__loy = {
  app,
  tap,
  floatTogether,
  releaseWish,
  launchRandom,
  setQuality(level) {
    app.level = clamp(level | 0, 0, QUALITY.length - 1);
    qualityLocked = true;
    layout(true);
  },
};
