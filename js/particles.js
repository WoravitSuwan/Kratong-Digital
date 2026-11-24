// Zero-allocation particle pools + multi-stage fireworks.

import { TAU, clamp, rand, pick, chance } from './util.js';

class P {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.g = 0;
    this.drag = 0;
    this.life = 1;
    this.max = 1;
    this.size = 8;
    this.size1 = 8;
    this.alpha = 1;
    this.spr = null;
    this.gly = null;
    this.gs = 1;
    this.gs1 = 1;
    this.rot = 0;
    this.vr = 0;
    this.flick = 0;
    this.flutter = 0;
    this.fq = 3;
    this.seed = Math.random() * TAU;
    this.emit = 0;
    this.emitT = 0;
    this.kind = 0;
    this.burst = null;
    this.pal = null;
    this.bscale = 1;
    this.fadeIn = 0;
    this.trail = 'gold';
    return this;
  }
}

/** Fixed-size pool with swap-remove; never allocates after construction. */
export class Pool {
  constructor(app, max) {
    this.app = app;
    this.max = max;
    this.cap = max;
    this.items = Array.from({ length: max }, () => new P());
    this.n = 0;
    this.onDeath = null;
    this.onEmit = null;
  }

  spawn() {
    if (this.n >= this.cap) return null;
    return this.items[this.n++].reset();
  }

  get busy() {
    return this.n / this.cap;
  }

  update(dt) {
    const items = this.items;
    let i = 0;
    while (i < this.n) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (this.onDeath && p.kind) this.onDeath(p);
        const last = this.n - 1;
        items[i] = items[last];
        items[last] = p;
        this.n--;
        continue;
      }
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.g * dt;
      if (p.flutter) p.vx += Math.sin(p.life * p.fq + p.seed) * p.flutter * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.emit > 0 && this.onEmit) {
        p.emitT -= dt;
        while (p.emitT <= 0) {
          p.emitT += p.emit;
          this.onEmit(p);
        }
      }
      i++;
    }
  }

  draw(ctx) {
    const dpr = this.app.dpr;
    const items = this.items;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const p = items[i];
      const k = p.life / p.max;
      let a = p.alpha * (k < 0.4 ? k / 0.4 : 1);
      if (p.fadeIn > 0) {
        const age = p.max - p.life;
        if (age < p.fadeIn) a *= age / p.fadeIn;
      }
      if (p.flick) a *= 1 - p.flick + p.flick * Math.random();
      if (a < 0.01) continue;
      ctx.globalAlpha = a > 1 ? 1 : a;
      if (p.spr) {
        const sz = p.size1 + (p.size - p.size1) * k;
        const s = p.spr;
        ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
      }
      if (p.gly) {
        const s = p.gly;
        const sc = p.gs1 + (p.gs - p.gs1) * k;
        const w = s.w * sc;
        const h = s.h * sc;
        if (p.rot) {
          const c = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, p.x * dpr, p.y * dpr);
          ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -w * 0.5, -h * 0.5, w, h);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
          ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, p.x - w * 0.5, p.y - h * 0.5, w, h);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- small reusable emitters --------------------------------------------

  /** Twinkly radial sparkle puff. */
  sparkle(x, y, n, colors, speed = 60, opts = {}) {
    const S = this.app.S;
    n = Math.max(1, Math.round(n * this.app.q));
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const a = Math.random() * TAU;
      const v = speed * (0.25 + Math.random() * 0.75);
      const col = pick(colors);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v + (opts.lift || 0);
      p.g = opts.g ?? 20;
      p.drag = opts.drag ?? 2.4;
      p.life = p.max = rand(opts.life?.[0] ?? 0.5, opts.life?.[1] ?? 1.1);
      p.spr = S.glow[col];
      p.size = rand(6, 11) * (opts.scale || 1);
      p.size1 = 1;
      p.alpha = opts.alpha ?? 0.9;
      p.flick = 0.4;
      if (chance(opts.glyphChance ?? 0.55)) {
        p.gly = S.gly[pick(opts.glyphs || ['star4', 'star4o', 'plus', 'dot'])][col];
        p.gs = rand(0.45, 0.8) * (opts.scale || 1);
        p.gs1 = 0.15;
      }
    }
  }

  /** Fairy dust along a swipe. */
  dust(x, y, col, vx = 0, vy = 0) {
    const S = this.app.S;
    const p = this.spawn();
    if (!p) return;
    p.x = x + rand(-5, 5);
    p.y = y + rand(-5, 5);
    p.vx = vx * 0.08 + rand(-22, 22);
    p.vy = vy * 0.08 + rand(-26, 12);
    p.g = 26;
    p.drag = 1.6;
    p.life = p.max = rand(0.7, 1.6);
    p.spr = S.glow[col];
    p.size = rand(7, 14);
    p.size1 = 1;
    p.alpha = 0.95;
    p.flick = 0.45;
    p.flutter = 30;
    p.fq = rand(3, 7);
    if (chance(0.7)) {
      p.gly = S.gly[pick(['star4', 'star4o', 'star4', 'dot', 'plus'])][col];
      p.gs = rand(0.4, 0.85);
      p.gs1 = 0.1;
    }
  }

  /** Rising pixel hearts. */
  hearts(x, y, n, colors, spread = 20) {
    const S = this.app.S;
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const col = pick(colors);
      p.x = x + rand(-spread, spread);
      p.y = y + rand(-spread * 0.3, spread * 0.3);
      p.vx = rand(-24, 24);
      p.vy = rand(-95, -45);
      p.g = -6;
      p.drag = 0.9;
      p.life = p.max = rand(1.4, 2.4);
      p.spr = S.soft[col];
      p.size = 18;
      p.size1 = 4;
      p.alpha = 0.85;
      p.gly = S.pxHeart[col] || S.pxHeart.pink;
      p.gs = rand(0.65, 1.05);
      p.gs1 = 0.3;
      p.flutter = 40;
      p.fq = rand(2, 4);
      p.fadeIn = 0.15;
    }
  }
}

// ---------------------------------------------------------------------------

const PALETTES = {
  love: ['pink', 'rose', 'magenta', 'white', 'sakura'],
  sakura: ['sakura', 'pink', 'white', 'rose'],
  gold: ['gold', 'amber', 'cream', 'white'],
  dream: ['cyan', 'lavender', 'blue', 'white', 'ice'],
  pastel: ['pink', 'cyan', 'lavender', 'gold', 'mint', 'peach'],
  ours: ['pink', 'cyan', 'lavender', 'white'],
};

const TINT = { love: 'pink', sakura: 'sakura', gold: 'gold', dream: 'cyan', pastel: 'lavender', ours: 'lavender' };

export const FIREWORK_TYPES = ['heart', 'heart', 'sakura', 'willow', 'peony', 'ring', 'heart', 'willow'];
export const PALETTE_NAMES = Object.keys(PALETTES);

/** Heart curve (unit ≈ 1 at the widest lobe). */
export function heartXY(t) {
  const s = Math.sin(t);
  const x = 16 * s * s * s;
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  return [x / 17, (y - 2.5) / 17];
}

export class Fireworks {
  constructor(app) {
    this.app = app;
    this.pool = new Pool(app, 2600);
    this.pool.onDeath = (p) => this.death(p);
    this.pool.onEmit = (p) => this.trail(p);
    this.flashes = [];
    this.crackleT = 0;
  }

  setQuality(q) {
    this.pool.cap = Math.round(this.pool.max * clamp(q, 0.35, 1));
  }

  radius(scale = 1) {
    const { W, horizonY } = this.app;
    return clamp(Math.min(W, horizonY * 1.4) * 0.27, 80, 230) * scale;
  }

  /** Launch a rocket from the horizon to (x1, y1), then burst. */
  launch(x1, y1, type = pick(FIREWORK_TYPES), pal = pick(PALETTE_NAMES), scale = 1, quiet = false) {
    const { W, horizonY, S, audio } = this.app;
    y1 = Math.min(y1, horizonY - 30);
    const x0 = clamp(x1 + rand(-W * 0.07, W * 0.07), 8, W - 8);
    const y0 = horizonY - 1;
    const T = rand(0.7, 0.95) * (0.55 + 0.45 * clamp((y0 - y1) / (horizonY * 0.8), 0, 1));
    const p = this.pool.spawn();
    if (!p) {
      this.burst(type, x1, y1, pal, scale);
      return;
    }
    p.kind = 1;
    p.x = x0;
    p.y = y0;
    p.life = p.max = T;
    p.g = (2 * (y0 - y1)) / (T * T);
    p.vy = -p.g * T;
    p.vx = (x1 - x0) / T;
    p.spr = S.glow.cream;
    p.size = p.size1 = 10;
    p.gly = S.gly.bullet.white;
    p.gs = p.gs1 = 0.55;
    p.emit = 0.014;
    p.burst = type;
    p.pal = pal;
    p.bscale = scale;
    p.alpha = 1;
    if (!quiet) audio?.launch();
  }

  death(p) {
    if (p.kind === 1) this.burst(p.burst, p.x, p.y, p.pal, p.bscale);
    else if (p.kind === 3) this.crackle(p.x, p.y);
  }

  trail(p) {
    const pool = this.pool;
    if (pool.busy > 0.82) return;
    const q = pool.spawn();
    if (!q) return;
    const S = this.app.S;
    q.x = p.x + rand(-1.2, 1.2);
    q.y = p.y + rand(-1.2, 1.2);
    if (p.kind === 1) {
      q.vx = rand(-10, 10);
      q.vy = rand(10, 40);
      q.g = 40;
      q.drag = 2.6;
      q.life = q.max = rand(0.25, 0.55);
      q.spr = S.glow[chance(0.5) ? 'amber' : 'gold'];
      q.size = 8;
      q.size1 = 1;
    } else {
      q.vx = p.vx * 0.05 + rand(-5, 5);
      q.vy = p.vy * 0.05 + rand(-2, 6);
      q.g = 16;
      q.drag = 2.8;
      q.life = q.max = rand(0.55, 1.0);
      q.spr = S.glow[p.trail];
      q.size = rand(5, 7);
      q.size1 = 1;
    }
    q.alpha = 0.75;
    q.flick = 0.5;
  }

  crackle(x, y) {
    const S = this.app.S;
    for (let i = 0; i < 5; i++) {
      const p = this.pool.spawn();
      if (!p) break;
      const a = Math.random() * TAU;
      const v = rand(20, 70);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.drag = 3;
      p.g = 20;
      p.life = p.max = rand(0.12, 0.32);
      p.spr = S.glow.white;
      p.size = 9;
      p.size1 = 2;
      p.flick = 0.85;
    }
    const now = performance.now();
    if (now - this.crackleT > 140) {
      this.crackleT = now;
      this.app.audio?.crackle();
    }
  }

  flash(x, y, R, col, power = 1) {
    this.flashes.push({ x, y, R, col, life: 1.3, max: 1.3, power });
    if (this.flashes.length > 10) this.flashes.shift();
  }

  // ---- burst shapes -------------------------------------------------------

  burst(type, x, y, pal = 'love', scale = 1) {
    const R = this.radius(scale);
    const colors = PALETTES[pal] || PALETTES.love;
    const q = this.app.q;
    switch (type) {
      case 'heart':
        this.heart(x, y, R * 0.85, colors, q, false);
        break;
      case 'bigheart':
        this.heart(x, y, R * 1.05, colors, q, true);
        break;
      case 'sakura':
        this.sakura(x, y, R, q);
        break;
      case 'willow':
        this.willow(x, y, R, q);
        break;
      case 'ring':
        this.ring(x, y, R, colors, q);
        break;
      default:
        this.peony(x, y, R, colors, q);
    }
    // white core pop
    const p = this.pool.spawn();
    if (p) {
      p.x = x;
      p.y = y;
      p.life = p.max = 0.22;
      p.spr = this.app.S.glow.white;
      p.size = R * 0.75;
      p.size1 = R * 0.2;
      p.alpha = 0.9;
    }
    const tint = type === 'willow' ? 'gold' : type === 'sakura' ? 'sakura' : TINT[pal] || 'pink';
    this.flash(x, y, R, tint, type === 'bigheart' ? 1.4 : 1);
    this.app.audio?.boom(scale);
    if (navigator.vibrate && this.app.haptics) navigator.vibrate(8);
  }

  heart(x, y, R, colors, q, split) {
    const S = this.app.S;
    const N = Math.round((split ? 170 : 110) * q);
    const k = 2.4;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU;
      const [hx, hy] = heartXY(t);
      const p = this.pool.spawn();
      if (!p) return;
      let col = pick(colors);
      if (split) col = hx < -0.08 ? pick(['pink', 'magenta', 'rose']) : hx > 0.08 ? pick(['cyan', 'ice', 'blue']) : 'lavender';
      const v = R * k * rand(0.97, 1.03);
      p.x = x;
      p.y = y;
      p.vx = hx * v;
      p.vy = hy * v;
      p.drag = k;
      p.g = 24;
      p.life = p.max = rand(1.9, 2.5);
      p.spr = S.glow[col];
      p.size = rand(9, 13);
      p.size1 = 3;
      p.flick = 0.25;
      if (i % 4 === 0) {
        p.gly = S.pxHeart[col] || S.gly.heart[col];
        p.gs = 0.7;
        p.gs1 = 0.35;
      } else if (i % 3 === 0) {
        p.gly = S.gly.star4[col];
        p.gs = 0.5;
        p.gs1 = 0.2;
      }
      if (i % 5 === 0) {
        p.kind = 2;
        p.emit = 0.05;
        p.trail = col;
      }
    }
    // shimmering inner fill
    const M = Math.round(46 * q);
    for (let i = 0; i < M; i++) {
      const t = Math.random() * TAU;
      const f = Math.sqrt(Math.random()) * 0.82;
      const [hx, hy] = heartXY(t);
      const p = this.pool.spawn();
      if (!p) return;
      const col = split ? (hx < 0 ? 'pink' : 'cyan') : pick(colors);
      p.x = x;
      p.y = y;
      p.vx = hx * R * k * f;
      p.vy = hy * R * k * f;
      p.drag = k;
      p.g = 18;
      p.life = p.max = rand(1.3, 2.1);
      p.spr = S.glow[col];
      p.size = rand(5, 8);
      p.size1 = 1;
      p.alpha = 0.7;
      p.flick = 0.7;
      if (chance(0.2)) p.kind = 3;
    }
  }

  sakura(x, y, R, q) {
    const S = this.app.S;
    const N = Math.round(40 * q);
    const k = 2.6;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const f = 0.4 + Math.random() * 0.6;
      const p = this.pool.spawn();
      if (!p) return;
      const col = pick(['sakura', 'pink', 'white', 'sakura', 'rose']);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * R * k * f;
      p.vy = Math.sin(a) * R * k * f;
      p.drag = k;
      p.g = 16;
      p.life = p.max = rand(2.8, 3.8);
      p.spr = S.soft[col];
      p.size = rand(16, 22);
      p.size1 = 6;
      p.alpha = 0.95;
      p.gly = S.gly[chance(0.55) ? 'flower' : 'flower2'][col];
      p.gs = rand(0.75, 1.15);
      p.gs1 = 0.45;
      p.rot = Math.random() * TAU;
      p.vr = rand(-2.2, 2.2);
      p.flutter = 46;
      p.fq = rand(1.5, 3.5);
    }
    const M = Math.round(70 * q);
    for (let i = 0; i < M; i++) {
      const a = Math.random() * TAU;
      const p = this.pool.spawn();
      if (!p) return;
      const col = pick(['pink', 'sakura', 'white']);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * R * 2.3 * rand(0.85, 1.05);
      p.vy = Math.sin(a) * R * 2.3 * rand(0.85, 1.05);
      p.drag = 2.3;
      p.g = 26;
      p.life = p.max = rand(1.1, 1.6);
      p.spr = S.glow[col];
      p.size = rand(6, 9);
      p.size1 = 1;
      p.flick = 0.6;
    }
  }

  willow(x, y, R, q) {
    const S = this.app.S;
    const N = Math.round(78 * q);
    const k = 1.35;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + rand(-0.05, 0.05);
      const f = 0.55 + Math.sqrt(Math.random()) * 0.45;
      const p = this.pool.spawn();
      if (!p) return;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * R * k * f;
      p.vy = Math.sin(a) * R * k * f;
      p.drag = k;
      p.g = 62;
      p.life = p.max = rand(2.6, 3.5);
      p.spr = S.glow[chance(0.5) ? 'gold' : 'amber'];
      p.size = rand(7, 10);
      p.size1 = 2;
      p.kind = 2;
      p.emit = 0.04;
      p.trail = chance(0.75) ? 'gold' : 'amber';
      p.flick = 0.3;
    }
  }

  peony(x, y, R, colors, q) {
    const S = this.app.S;
    const N = Math.round(96 * q);
    const k = 2.1;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const f = 0.82 + Math.random() * 0.18;
      const p = this.pool.spawn();
      if (!p) return;
      const col = pick(colors);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * R * k * f;
      p.vy = Math.sin(a) * R * k * f;
      p.drag = k;
      p.g = 34;
      p.life = p.max = rand(1.4, 2.0);
      p.spr = S.glow[col];
      p.size = rand(8, 12);
      p.size1 = 2;
      p.flick = 0.3;
      if (i % 3 === 0) {
        p.gly = S.gly[pick(['star4', 'ast', 'plus'])][col];
        p.gs = 0.55;
        p.gs1 = 0.2;
      }
      if (chance(0.32)) p.kind = 3;
    }
  }

  ring(x, y, R, colors, q) {
    const S = this.app.S;
    const N = Math.round(72 * q);
    const k = 2.2;
    const tilt = rand(-0.6, 0.6);
    const flat = rand(0.35, 0.7);
    const c1 = pick(colors);
    const c2 = pick(colors);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const ex = Math.cos(a);
      const ey = Math.sin(a) * flat;
      const rx = ex * Math.cos(tilt) - ey * Math.sin(tilt);
      const ry = ex * Math.sin(tilt) + ey * Math.cos(tilt);
      const p = this.pool.spawn();
      if (!p) return;
      const col = i % 2 ? c1 : c2;
      p.x = x;
      p.y = y;
      p.vx = rx * R * k;
      p.vy = ry * R * k;
      p.drag = k;
      p.g = 26;
      p.life = p.max = rand(1.5, 2.0);
      p.spr = S.glow[col];
      p.size = 11;
      p.size1 = 2;
      p.gly = S.gly.star4[col];
      p.gs = 0.5;
      p.gs1 = 0.2;
      p.flick = 0.2;
    }
    this.pool.sparkle(x, y, 30, colors, R * 0.9, { g: 20, life: [0.8, 1.3] });
  }

  // ---- update / draw ------------------------------------------------------

  update(dt) {
    this.pool.update(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
  }

  /** Brief sky illumination behind each burst. */
  drawFlashes(ctx) {
    if (!this.flashes.length) return;
    const S = this.app.S;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, 0.22 * f.power * k * k);
      const sz = f.R * 3.4;
      ctx.drawImage(S.soft[f.col].img, S.soft[f.col].sx, S.soft[f.col].sy, S.soft[f.col].sw, S.soft[f.col].sh, f.x - sz / 2, f.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  draw(ctx) {
    this.pool.draw(ctx);
  }
}
