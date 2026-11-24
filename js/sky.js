// Night sky: gradient, Milky Way, ASCII full moon, twinkling ASCII stars,
// shooting stars and the distant temple shoreline.

import { TAU, clamp, lerp, rand, pick, mulberry32, makeNoise2D, fbm, makeCanvas, smoothstep, mixHex, gauss } from './util.js';
import { MONO, glowify, drawSprite, drawSpriteSize, sprite } from './sprites.js';

// Approximate lunar maria (x, y, rx, ry) on a unit disc — gives the moon its
// familiar face (and the "rabbit in the moon" of Thai folklore).
const MARIA = [
  [-0.55, -0.02, 0.3, 0.52],
  [-0.27, -0.42, 0.3, 0.22],
  [0.14, -0.36, 0.17, 0.15],
  [0.3, -0.06, 0.21, 0.17],
  [0.68, -0.3, 0.11, 0.1],
  [0.55, 0.16, 0.12, 0.17],
  [0.32, 0.27, 0.09, 0.09],
  [-0.18, 0.38, 0.18, 0.12],
  [-0.48, 0.38, 0.1, 0.09],
  [-0.02, -0.7, 0.42, 0.07],
  [0.0, -0.17, 0.09, 0.07],
];

const MOON_RAMP = '.:-=+*#%@';
const STAR_COLORS = ['white', 'white', 'ice', 'sakura', 'cream', 'lavender'];

export class Sky {
  constructor(app) {
    this.app = app;
    this.shooting = [];
    this.nextShoot = rand(2.5, 5);
    this.moonFlash = 0;
    this.stars = [];
  }

  layout() {
    const { W, H, horizonY } = this.app;
    this.moonR = clamp(Math.min(W, H * 0.62) * 0.215, 46, 150);
    this.moonX = W * (W > H ? 0.64 : 0.5);
    this.moonY = Math.max(this.moonR + 70, horizonY * 0.37);
    this.buildBackground();
    this.buildMoon();
    this.buildStars();
  }

  // ---------------------------------------------------------------- static
  buildBackground() {
    const { W, H, horizonY: hy, dpr } = this.app;
    const c = makeCanvas(W * dpr, H * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const rnd = mulberry32(1105);
    const noise = makeNoise2D(24);

    // Sky gradient
    let gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#03040c');
    gr.addColorStop(0.52, '#0a0f2c');
    gr.addColorStop(1, '#161238');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, hy + 1);

    g.save();
    g.beginPath();
    g.rect(0, 0, W, hy);
    g.clip();

    // Warm festival haze rising from the horizon
    gr = g.createLinearGradient(0, hy - H * 0.24, 0, hy);
    gr.addColorStop(0, 'rgba(255,120,170,0)');
    gr.addColorStop(0.7, 'rgba(255,128,170,0.06)');
    gr.addColorStop(1, 'rgba(255,170,150,0.14)');
    g.fillStyle = gr;
    g.fillRect(0, hy - H * 0.24, W, H * 0.24);

    g.globalCompositeOperation = 'lighter';
    this.paintNebula(g, rnd, noise);

    // Fine dust of tiny static stars
    const nDust = Math.round((W * hy) / 520);
    for (let i = 0; i < nDust; i++) {
      const x = rnd() * W;
      const y = Math.pow(rnd(), 1.25) * hy * 0.97;
      const s = 0.4 + rnd() * 0.9;
      const a = (0.12 + rnd() * 0.5) * (1 - 0.5 * (y / hy));
      const col = rnd() < 0.8 ? '255,255,255' : rnd() < 0.5 ? '255,214,236' : '200,220,255';
      g.fillStyle = `rgba(${col},${a.toFixed(3)})`;
      g.fillRect(x, y, s, s);
    }

    // Moon halo layers
    const { moonX: mx, moonY: my, moonR: R } = this;
    gr = g.createRadialGradient(mx, my, R * 0.9, mx, my, R * 2.6);
    gr.addColorStop(0, 'rgba(255,236,200,0.30)');
    gr.addColorStop(0.35, 'rgba(255,214,150,0.12)');
    gr.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = gr;
    g.fillRect(mx - R * 2.7, my - R * 2.7, R * 5.4, R * 5.4);
    gr = g.createRadialGradient(mx, my, R, mx, my, R * 6.5);
    gr.addColorStop(0, 'rgba(196,166,255,0.11)');
    gr.addColorStop(0.5, 'rgba(150,130,255,0.04)');
    gr.addColorStop(1, 'rgba(120,100,255,0)');
    g.fillStyle = gr;
    g.fillRect(mx - R * 6.5, my - R * 6.5, R * 13, R * 13);
    // faint lunar corona ring
    for (const [rr, a, lw] of [
      [2.95, 0.035, 0.5],
      [3.05, 0.03, 0.22],
    ]) {
      g.strokeStyle = `rgba(255,196,232,${a})`;
      g.lineWidth = R * lw;
      g.beginPath();
      g.arc(mx, my, R * rr, 0, TAU);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();

    // Water base
    gr = g.createLinearGradient(0, hy, 0, H);
    gr.addColorStop(0, '#15123a');
    gr.addColorStop(0.18, '#0d0c2b');
    gr.addColorStop(0.6, '#070923');
    gr.addColorStop(1, '#03040c');
    g.fillStyle = gr;
    g.fillRect(0, hy, W, H - hy);
    // mirrored haze near the horizon
    gr = g.createLinearGradient(0, hy, 0, hy + (H - hy) * 0.35);
    gr.addColorStop(0, 'rgba(255,150,190,0.10)');
    gr.addColorStop(1, 'rgba(255,150,190,0)');
    g.fillStyle = gr;
    g.fillRect(0, hy, W, (H - hy) * 0.35);

    g.globalCompositeOperation = 'lighter';
    // soft static moon column on the water (glyph shimmer goes on top)
    paintMoonPath(g, mx, hy, H - hy, R, W, 0.24, [255, 214, 150]);
    g.globalCompositeOperation = 'source-over';

    this.paintShore(g, rnd, noise);

    // Horizon line, brightest under the moon
    gr = g.createLinearGradient(0, 0, W, 0);
    const mxN = clamp(mx / W, 0.05, 0.95);
    gr.addColorStop(0, 'rgba(190,170,255,0.10)');
    gr.addColorStop(Math.max(0, mxN - 0.2), 'rgba(220,190,255,0.22)');
    gr.addColorStop(mxN, 'rgba(255,230,170,0.75)');
    gr.addColorStop(Math.min(1, mxN + 0.2), 'rgba(220,190,255,0.22)');
    gr.addColorStop(1, 'rgba(190,170,255,0.10)');
    g.fillStyle = gr;
    g.fillRect(0, hy - 0.5, W, 1.2);

    this.bg = c;
  }

  paintNebula(g, rnd, noise) {
    const { W, horizonY: hy } = this.app;
    const p0 = [-0.12 * W, 0.04 * hy];
    const p1 = [1.12 * W, 0.98 * hy];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const bw = Math.max(46, Math.min(W, hy) * 0.2);

    // colored gas clouds
    const cloudCols = ['155,123,255', '255,127,200', '95,212,255', '255,179,138', '195,166,255'];
    for (let i = 0; i < 18; i++) {
      const t = rnd();
      const off = gauss(rnd) * bw * 0.35;
      const x = p0[0] + ux * t * len + nx * off;
      const y = p0[1] + uy * t * len + ny * off;
      const r = bw * (0.55 + rnd() * 0.9);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const col = cloudCols[(rnd() * cloudCols.length) | 0];
      const a = 0.035 + rnd() * 0.045;
      gr.addColorStop(0, `rgba(${col},${a})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // tiny pastel dots forming the galactic band
    const cols = ['255,198,232', '216,198,255', '191,233,255', '255,225,196', '255,255,255'];
    const n = Math.round((W * hy) / 85);
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const off = gauss(rnd) * bw * 0.42;
      const x = p0[0] + ux * t * len + nx * off;
      const y = p0[1] + uy * t * len + ny * off;
      if (y > hy - 2 || x < 0 || x > W) continue;
      const density = fbm(noise, x * 0.012, y * 0.012, 3);
      if (density < 0.36 + rnd() * 0.22) continue;
      const fall = Math.exp(-(off * off) / (bw * bw * 0.3));
      const a = (0.1 + rnd() * 0.55) * (0.35 + 0.65 * fall);
      const s = 0.5 + rnd() * 1.1;
      g.fillStyle = `rgba(${cols[(rnd() * cols.length) | 0]},${a.toFixed(3)})`;
      g.fillRect(x, y, s, s);
    }
  }

  paintShore(g, rnd, noise) {
    const { W, H, horizonY: hy } = this.app;
    const sil = '#070619';
    g.fillStyle = sil;
    const treeH = H * 0.024;
    const segments = [
      [-4, W * 0.44],
      [W * 0.8, W + 4],
    ];
    const outline = new Path2D();
    for (const [a, b] of segments) {
      const p = new Path2D();
      p.moveTo(a, hy + 1);
      for (let x = a; x <= b; x += 2) {
        const env = smoothstep(a, a + 26, x) * smoothstep(b, b - 26, x);
        const h = (noise(x * 0.045, 3.1) * 0.65 + noise(x * 0.19, 8.2) * 0.35) * treeH * env + env * 2;
        p.lineTo(x, hy - h);
        if (x === a) outline.moveTo(x, hy - h);
        else outline.lineTo(x, hy - h);
      }
      p.lineTo(b, hy + 1);
      p.closePath();
      g.fill(p);
    }

    // Chedi silhouettes
    const chedi = (cx, Hc) => {
      const p = new Path2D();
      const r = (x, y, w, h) => p.rect(cx + x - w / 2, hy - y - h, w, h);
      r(0, 0, Hc * 0.62, Hc * 0.05);
      r(0, Hc * 0.05, Hc * 0.48, Hc * 0.05);
      r(0, Hc * 0.1, Hc * 0.36, Hc * 0.04);
      p.ellipse(cx, hy - Hc * 0.14, Hc * 0.17, Hc * 0.2, 0, Math.PI, 0);
      r(0, Hc * 0.33, Hc * 0.1, Hc * 0.06);
      for (let k = 0; k < 9; k++) r(0, Hc * 0.39 + k * Hc * 0.035, Hc * 0.075 * (1 - k / 10), Hc * 0.03);
      p.moveTo(cx - Hc * 0.018, hy - Hc * 0.7);
      p.lineTo(cx, hy - Hc);
      p.lineTo(cx + Hc * 0.018, hy - Hc * 0.7);
      p.closePath();
      g.fillStyle = sil;
      g.fill(p);
      g.strokeStyle = 'rgba(205,180,255,0.16)';
      g.lineWidth = 0.8;
      g.stroke(p);
      // tiny glowing finial
      const gr = g.createRadialGradient(cx, hy - Hc, 0, cx, hy - Hc, 6);
      gr.addColorStop(0, 'rgba(255,220,160,0.8)');
      gr.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = gr;
      g.fillRect(cx - 6, hy - Hc - 6, 12, 12);
    };
    chedi(W * 0.19, H * 0.085);
    chedi(W * 0.31, H * 0.05);
    chedi(W * 0.9, H * 0.04);

    g.strokeStyle = 'rgba(190,170,255,0.14)';
    g.lineWidth = 0.8;
    g.stroke(outline);

    // festival lights along the shore + their streaky reflections
    g.globalCompositeOperation = 'lighter';
    const n = Math.round(W / 8);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W;
      const y = hy - 0.5 - rnd() * 3;
      const warm = rnd() < 0.7;
      const col = warm ? '255,190,110' : '255,140,190';
      const r = 2 + rnd() * 3.5;
      let gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${col},0.85)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      const rl = 4 + rnd() * 10;
      gr = g.createLinearGradient(0, hy, 0, hy + rl);
      gr.addColorStop(0, `rgba(${col},0.35)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x - 0.6, hy + 0.5, 1.2, rl);
    }
    g.globalCompositeOperation = 'source-over';
  }

  buildMoon() {
    const { dpr } = this.app;
    const R = this.moonR;
    const pad = Math.ceil(R * 0.3);
    const size = R * 2 + pad * 2;
    this.moonSize = size;
    this.moonSprites = [0, 1, 2].map((v) => this.renderMoon(R, size, v));

    const gs = R * 4.8;
    const gc = makeCanvas(gs * dpr, gs * dpr);
    const g = gc.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createRadialGradient(gs / 2, gs / 2, R * 0.85, gs / 2, gs / 2, gs / 2);
    gr.addColorStop(0, 'rgba(255,242,210,0.6)');
    gr.addColorStop(0.15, 'rgba(255,224,170,0.25)');
    gr.addColorStop(0.45, 'rgba(255,200,170,0.07)');
    gr.addColorStop(1, 'rgba(255,190,200,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, gs, gs);
    this.moonGlow = sprite(gc, gs, gs);
  }

  renderMoon(R, size, variant) {
    const { dpr } = this.app;
    const c = makeCanvas(size * dpr, size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;

    // luminous pearl body under the glyphs
    let gr = g.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.05, cx, cy, R);
    gr.addColorStop(0, 'rgba(255,251,238,0.42)');
    gr.addColorStop(0.7, 'rgba(255,236,196,0.28)');
    gr.addColorStop(1, 'rgba(255,214,150,0.14)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();

    const cw = R / 15.5;
    const ch = cw * 1.62;
    g.font = `700 ${(ch * 1.02).toFixed(2)}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const rnd = mulberry32(77 + variant * 131);
    const noise = makeNoise2D(9);
    const cols = Math.ceil((2 * R) / cw);
    const rows = Math.ceil((2 * R) / ch);
    const ox = cx - (cols * cw) / 2;
    const oy = cy - (rows * ch) / 2;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const px = ox + (k + 0.5) * cw;
        const py = oy + (r + 0.5) * ch;
        const x = (px - cx) / R;
        const y = (py - cy) / R;
        const r2 = x * x + y * y;
        if (r2 > 0.985) continue;
        const nz = Math.sqrt(1 - r2);
        let b = 0.4 + 0.6 * Math.pow(nz, 0.5);
        let m = 0;
        for (const [mx, my, rx, ry] of MARIA) {
          const dx = (x - mx) / rx;
          const dy = (y - my) / ry;
          const d = Math.sqrt(dx * dx + dy * dy) + (noise(x * 6 + 11, y * 6 + 5) - 0.5) * 0.55;
          m = Math.max(m, 1 - smoothstep(0.6, 1.05, d));
        }
        b *= 1 - 0.4 * m;
        // Tycho & Copernicus: bright craters
        const t1 = (x + 0.12) ** 2 + (y - 0.7) ** 2;
        const t2 = (x + 0.33) ** 2 + (y + 0.06) ** 2;
        b += 0.4 * Math.exp(-t1 / 0.004) + 0.25 * Math.exp(-t2 / 0.003);
        b += (fbm(noise, x * 7 + 3, y * 7 + 9, 3) - 0.5) * 0.2 + (rnd() - 0.5) * 0.06;
        b = clamp(b, 0, 1);
        let idx = Math.round(b * (MOON_RAMP.length - 1));
        if (variant && rnd() < 0.14) idx += rnd() < 0.5 ? -1 : 1;
        idx = clamp(idx, 0, MOON_RAMP.length - 1);
        const col = b > 0.62 ? mixHex('#ffe6a8', '#fffbf0', (b - 0.62) / 0.38) : mixHex('#e2aa58', '#ffe6a8', b / 0.62);
        g.globalAlpha = 0.5 + 0.5 * b;
        g.fillStyle = col;
        g.fillText(MOON_RAMP[idx], px, py);
      }
    }
    g.globalAlpha = 1;
    // limb highlight
    gr = g.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.02);
    gr.addColorStop(0, 'rgba(255,245,220,0)');
    gr.addColorStop(0.8, 'rgba(255,240,210,0.25)');
    gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, R * 1.02, 0, TAU);
    g.fill();

    const out = glowify(c, '#ffd796', dpr, [
      [R * 0.16, 0.55],
      [R * 0.05, 0.6],
    ]);
    return sprite(out, size, size);
  }

  buildStars() {
    const { W, horizonY: hy, S } = this.app;
    const rnd = mulberry32(2026);
    const area = W * hy;
    const groups = [
      { n: Math.round(area / 1700), keys: ['dot'], sc: [0.35, 0.6], a: [0.35, 0.85], big: false },
      { n: Math.round(area / 3800), keys: ['plus', 'ast', 'star4o', 'dot'], sc: [0.38, 0.62], a: [0.45, 0.95], big: false },
      { n: clamp(Math.round(area / 15000), 8, 34), keys: ['star4'], sc: [0.55, 0.95], a: [0.7, 1], big: true },
    ];
    const stars = [];
    const { moonX, moonY, moonR } = this;
    for (const gp of groups) {
      for (let i = 0; i < gp.n; i++) {
        let x;
        let y;
        let tries = 0;
        do {
          x = rnd() * W;
          y = Math.pow(rnd(), 1.15) * hy * 0.93;
          tries++;
        } while (Math.hypot(x - moonX, y - moonY) < moonR * 1.55 && tries < 8);
        const col = STAR_COLORS[(rnd() * STAR_COLORS.length) | 0];
        const key = gp.keys[(rnd() * gp.keys.length) | 0];
        stars.push({
          x,
          y,
          spr: S.gly[key][col],
          glow: gp.big ? S.glow[col] : null,
          sc: lerp(gp.sc[0], gp.sc[1], rnd()) * (1 - 0.25 * (y / hy)),
          a: lerp(gp.a[0], gp.a[1], rnd()),
          sp: 0.6 + rnd() * 2.6,
          ph: rnd() * TAU,
          big: gp.big,
        });
      }
    }
    this.stars = stars;
  }

  // ---------------------------------------------------------------- dynamic
  shoot(opts = {}) {
    const { W, H, horizonY: hy } = this.app;
    const dir = opts.dir ?? (Math.random() < 0.5 ? -1 : 1);
    const ang = rand(0.32, 0.62);
    const sp = rand(620, 980) * (opts.speed || 1);
    const x = opts.x ?? (dir < 0 ? rand(W * 0.35, W * 1.05) : rand(-W * 0.05, W * 0.65));
    const y = opts.y ?? rand(H * 0.015, hy * 0.38);
    const life = rand(0.75, 1.25);
    const col = pick(['255,236,250', '210,236,255', '255,226,200', '230,214,255']);
    this.shooting.push({ x, y, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, life, max: life, len: rand(110, 210), rgb: col, sparkT: 0 });
  }

  shootBurst(n = 4) {
    for (let i = 0; i < n; i++) this.app.director.after(i * rand(0.12, 0.3), () => this.shoot({ speed: 1.15 }));
  }

  update(dt) {
    this.moonFlash = Math.max(0, this.moonFlash - dt * 0.7);
    this.nextShoot -= dt;
    if (this.nextShoot <= 0) {
      this.shoot();
      this.nextShoot = rand(3.5, 8.5);
    }
    const { horizonY: hy, fw, S } = this.app;
    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const s = this.shooting[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.sparkT -= dt;
      if (s.sparkT <= 0 && fw) {
        s.sparkT = 0.035;
        const p = fw.pool.spawn();
        if (p) {
          p.x = s.x;
          p.y = s.y;
          p.vx = s.vx * 0.03 + rand(-8, 8);
          p.vy = s.vy * 0.03 + rand(-4, 10);
          p.g = 14;
          p.drag = 2;
          p.life = p.max = rand(0.5, 1);
          p.spr = S.glow.ice;
          p.size = rand(4, 7);
          p.size1 = 1;
          p.alpha = 0.7;
          p.flick = 0.6;
        }
      }
      if (s.life <= 0 || s.y > hy - 4) this.shooting.splice(i, 1);
    }
  }

  drawBackground(ctx) {
    const { W, H } = this.app;
    ctx.drawImage(this.bg, 0, 0, W, H);
  }

  drawMoon(ctx, t) {
    const { moonX: x, moonY: y, moonSize: size } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, 0.26 + 0.06 * Math.sin(t * 0.6) + this.moonFlash * 0.75);
    drawSprite(ctx, this.moonGlow, x, y);
    ctx.globalCompositeOperation = 'source-over';
    const phase = t * 0.22;
    const i0 = Math.floor(phase) % 3;
    const i1 = (i0 + 1) % 3;
    const f = smoothstep(0, 1, phase - Math.floor(phase));
    ctx.globalAlpha = 1;
    drawSpriteSize(ctx, this.moonSprites[i0], x, y, size, size);
    ctx.globalAlpha = f;
    drawSpriteSize(ctx, this.moonSprites[i1], x, y, size, size);
    if (this.moonFlash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.moonFlash * 0.45;
      drawSpriteSize(ctx, this.moonSprites[i1], x, y, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  drawStars(ctx, t) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      const a = s.a * (0.3 + 0.7 * tw * tw);
      ctx.globalAlpha = a;
      if (s.big) {
        const flare = 0.82 + 0.4 * Math.pow(tw, 6);
        drawSprite(ctx, s.spr, s.x, s.y, s.sc * flare);
        ctx.globalAlpha = a * 0.45;
        drawSpriteSize(ctx, s.glow, s.x, s.y, 16 * flare, 16 * flare);
      } else {
        drawSprite(ctx, s.spr, s.x, s.y, s.sc);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawShooting(ctx) {
    if (!this.shooting.length) return;
    const { S } = this.app;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.shooting) {
      const k = s.life / s.max;
      const a = Math.sin(Math.PI * Math.min(1, (1 - k) * 1.4 + 0.05));
      const sp = Math.hypot(s.vx, s.vy);
      const ux = s.vx / sp;
      const uy = s.vy / sp;
      const len = s.len * (0.5 + 0.5 * (1 - k));
      const tx = s.x - ux * len;
      const ty = s.y - uy * len;
      const gr = ctx.createLinearGradient(s.x, s.y, tx, ty);
      gr.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
      gr.addColorStop(0.2, `rgba(${s.rgb},${0.55 * a})`);
      gr.addColorStop(1, `rgba(${s.rgb},0)`);
      ctx.strokeStyle = gr;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tx, ty);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = a;
      drawSpriteSize(ctx, S.glow.white, s.x, s.y, 26, 26);
      drawSprite(ctx, S.gly.star4.white, s.x, s.y, 0.62);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Vertical shimmering column of light under the moon, widening toward the viewer. */
export function paintMoonPath(g, mx, top, hgt, R, W, alpha, rgb) {
  const [r, gg, b] = rgb;
  for (let y = 0; y < hgt; y += 2) {
    const hw = R * 0.42 + y * 0.48;
    const fade = alpha * (0.55 + 0.45 * (1 - y / hgt));
    const gr = g.createLinearGradient(mx - hw * 1.6, 0, mx + hw * 1.6, 0);
    gr.addColorStop(0, `rgba(${r},${gg},${b},0)`);
    gr.addColorStop(0.3, `rgba(${r},${gg},${b},${fade * 0.35})`);
    gr.addColorStop(0.5, `rgba(${r},${gg},${b},${fade})`);
    gr.addColorStop(0.7, `rgba(${r},${gg},${b},${fade * 0.35})`);
    gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = gr;
    g.fillRect(mx - hw * 1.6, top + y, hw * 3.2, 2.05);
  }
}
