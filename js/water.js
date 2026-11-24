// River surface: a perspective grid of ASCII wave glyphs that is re-lit every
// frame by the moon, lanterns, fireworks, ripples and the two krathongs.
//
// Glyphs are drawn white into an offscreen layer, then tinted with
// 'source-atop' so colored light only lands on the characters themselves —
// true ASCII reflections.

import { TAU, clamp, lerp, rand, pick, gauss, makeCanvas, hexToRgb } from './util.js';
import { MONO, Atlas, drawSprite, drawSpriteSize, sprite, COLORS } from './sprites.js';
import { paintMoonPath } from './sky.js';
import { buildKrathongBody, MINI_SCHEMES } from './krathong.js';

const WCHARS = ['·', '-', '~', '≈', '✦'];
const TIERS = [3.4, 4, 4.7, 5.5, 6.5, 7.6, 9, 10.6, 12.5, 14.7, 17.3, 20.4, 24, 28.3];
const MAXL = 44;

export class Water {
  constructor(app) {
    this.app = app;
    this.ripples = [];
    this.floaters = [];
    this.L = new Float32Array(MAXL * 5);
    this.Lspr = new Array(MAXL);
    this.nL = 0;
    this.fireflies = [];
    this.distant = [];
    this.glints = [];
    this.rowLights = new Int16Array(64 * MAXL);
    this.rowLightN = new Int16Array(64);
  }

  layout() {
    const { W, H, horizonY, dpr } = this.app;
    this.top = horizonY;
    this.hgt = H - horizonY;
    this.canvas = makeCanvas(W * dpr, this.hgt * dpr);
    this.g = this.canvas.getContext('2d');
    this.buildGlyphs();
    this.buildRows();
    this.buildTints();
    this.buildMinis();
    this.initFireflies();
    this.initDistant();
    this.glints.length = 0;
  }

  // ------------------------------------------------------------ building
  buildGlyphs() {
    const atlas = new Atlas(this.app.dpr, 1024);
    this.tiers = TIERS.map((px) =>
      WCHARS.map((ch, i) => {
        const glow = i === 4 ? 0.5 : px > 9 ? 0.18 : 0;
        const pad = Math.ceil(px * glow) + 1;
        return atlas.add(px * 1.1 + pad * 2, px * 1.25 + pad * 2, (g, w, h) => {
          g.font = `${i === 4 ? 400 : 700} ${px}px ${MONO}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = '#ffffff';
          if (glow) {
            g.shadowColor = 'rgba(255,255,255,0.8)';
            g.shadowBlur = px * glow * atlas.dpr;
          }
          g.fillText(ch, w / 2, h / 2);
        });
      }),
    );
  }

  buildRows() {
    const { W } = this.app;
    const hgt = this.hgt;
    const dens = this.app.waterDensity || 1;
    const h0 = clamp(hgt * 0.012, 3.4, 6);
    const h1 = clamp(hgt * 0.05, 12, 27);
    const ratio = (hgt - h0) / (hgt - h1);
    const widthBoost = clamp(Math.sqrt(W / 430), 1, 1.9);
    const rows = [];
    let y = 0;
    let rh = h0;
    while (y < hgt && rows.length < 64) {
      rows.push([y + rh * 0.5, rh]);
      y += rh;
      rh *= ratio;
    }
    const n = rows.length;
    this.nRows = n;
    this.rowY = new Float32Array(n);
    this.rowH = new Float32Array(n);
    this.rowT = new Int8Array(n);
    this.rowSc = new Float32Array(n);
    this.rowSp = new Float32Array(n);
    this.rowN = new Int16Array(n);
    this.rowX0 = new Float32Array(n);
    this.rowWz = new Float32Array(n);
    this.rowA = new Float32Array(n);
    let cells = 0;
    rows.forEach(([ry, rrh], i) => {
      const s = ry / hgt;
      const sp = rrh * 1.22 * dens * widthBoost;
      const cnt = Math.ceil(W / sp) + 2;
      let t = TIERS.findIndex((px) => px >= rrh * 1.05);
      if (t < 0) t = TIERS.length - 1;
      this.rowY[i] = ry;
      this.rowH[i] = rrh;
      this.rowT[i] = t;
      this.rowSc[i] = (rrh * 1.05) / TIERS[t];
      this.rowSp[i] = sp;
      this.rowN[i] = cnt;
      this.rowX0[i] = (W - (cnt - 1) * sp) / 2 + (i % 2 ? sp * 0.5 : 0);
      this.rowWz[i] = 64 / rrh;
      this.rowA[i] = lerp(0.24, 0.66, Math.pow(s, 0.7));
      cells += cnt;
    });
    this.cells = cells;
    this.h0 = h0;
    this.h1 = h1;
  }

  buildTints() {
    const { W, dpr, sky } = this.app;
    const hgt = this.hgt;
    // base water tint
    const g = this.g;
    const gr = g.createLinearGradient(0, 0, 0, hgt);
    gr.addColorStop(0, '#c9b8ff');
    gr.addColorStop(0.25, '#a7a8ff');
    gr.addColorStop(0.6, '#7f9dff');
    gr.addColorStop(1, '#5b86f0');
    this.baseTint = gr;
    // golden moon column tint
    const c = makeCanvas(W * dpr, hgt * dpr);
    const mg = c.getContext('2d');
    mg.scale(dpr, dpr);
    paintMoonPath(mg, sky.moonX, 0, hgt, sky.moonR, W, 1, [255, 214, 140]);
    this.moonTint = c;
  }

  buildMinis() {
    const { Wk, dpr } = this.app;
    this.miniSprites = MINI_SCHEMES.map((sc) => {
      const b = buildKrathongBody(sc, Wk * 0.4, dpr, { cols: 13, incense: false, flowers: false });
      b.tint = sc.tint;
      return b;
    });
  }

  initFireflies() {
    const { W, H } = this.app;
    const n = Math.round(24 * clamp(W / 390, 1, 2.2));
    this.fireflies = [];
    for (let i = 0; i < n; i++) {
      this.fireflies.push({
        x: rand(W),
        y: rand(this.top - 50, H - 70),
        ph: rand(TAU),
        sp: rand(0.6, 1.4),
        col: pick(['mint', 'gold', 'cream', 'sakura', 'ice', 'lavender', 'gold']),
        r: rand(0.6, 1.25),
        bp: rand(TAU),
        bs: rand(0.7, 2),
      });
    }
  }

  initDistant() {
    const { W } = this.app;
    const n = Math.round(12 * clamp(W / 390, 1, 2.2));
    this.distant = [];
    for (let i = 0; i < n; i++) {
      this.distant.push({ x: rand(W), d: rand(0.012, 0.2), vx: rand(-5, 5), col: pick(['amber', 'gold', 'rose', 'peach']), ph: rand(TAU) });
    }
  }

  /** Perspective scale of an object floating at screen y (1 at the krathong line). */
  persp(y) {
    return clamp((y - this.top) / (this.app.waterY - this.top), 0.02, 1.6);
  }

  // ------------------------------------------------------------ dynamics
  beginLights() {
    this.nL = 0;
  }

  addLight(x, y, rx, ry, I, spr) {
    if (this.nL >= MAXL || I < 0.012 || y < this.top - ry) return;
    const o = this.nL * 5;
    const L = this.L;
    L[o] = x;
    L[o + 1] = y;
    L[o + 2] = 1 / rx;
    L[o + 3] = 1 / ry;
    L[o + 4] = I;
    this.Lspr[this.nL++] = spr;
  }

  addRipple(x, y, color = 'cyan', strength = 1, speed = 1) {
    const sc = this.persp(y);
    const [r, g, b] = hexToRgb(COLORS[color] || COLORS.cyan);
    this.ripples.push({
      x,
      y,
      r: 2,
      v: 58 * sc * speed,
      life: 2.4,
      max: 2.4,
      a: strength,
      rgb: `${r},${g},${b}`,
      col: color,
      flat: 0.14 + 0.24 * clamp((y - this.top) / this.hgt, 0, 1),
      sc: Math.max(0.3, sc),
      gap: 14 * sc,
    });
    if (this.ripples.length > 12) this.ripples.shift();
  }

  addFloater(x, y) {
    const spr = pick(this.miniSprites);
    this.floaters.push({ x, y, spr, ph: rand(TAU), vx: rand(-7, 7), age: 0 });
    if (this.floaters.length > 14) this.floaters.shift();
  }

  update(dt, t) {
    const { W, H } = this.app;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life -= dt;
      r.r += r.v * dt;
      r.v *= Math.exp(-0.35 * dt);
      if (r.life <= 0) this.ripples.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.age += dt;
      f.y -= (f.y - this.top) * 0.05 * dt;
      f.x += f.vx * dt * this.persp(f.y);
      if (f.y - this.top < this.hgt * 0.04) this.floaters.splice(i, 1);
    }
    for (const f of this.fireflies) {
      f.x += (Math.sin(t * 0.37 * f.sp + f.ph) * 14 + Math.sin(t * 0.13 + f.ph * 2) * 8) * dt;
      f.y += Math.cos(t * 0.29 * f.sp + f.ph * 1.3) * 9 * dt;
      if (f.x < -10) f.x = W + 10;
      if (f.x > W + 10) f.x = -10;
      if (f.y < this.top - 70) f.y = this.top - 70;
      if (f.y > H - 60) f.y = H - 60;
    }
    for (const d of this.distant) {
      d.x += d.vx * dt * (0.3 + d.d * 3);
      if (d.x < -10) d.x = W + 10;
      if (d.x > W + 10) d.x = -10;
    }
    // moon glints
    const { sky } = this.app;
    while (this.glints.length < 20) {
      const yr = Math.pow(Math.random(), 0.8) * this.hgt;
      const hw = sky.moonR * 0.42 + yr * 0.48;
      const life = rand(0.3, 0.8);
      this.glints.push({ x: sky.moonX + gauss() * hw * 0.38, y: this.top + yr, life, max: life, s: 0.3 + (yr / this.hgt) * 0.7 });
    }
    for (let i = this.glints.length - 1; i >= 0; i--) {
      this.glints[i].life -= dt;
      if (this.glints[i].life <= 0) this.glints.splice(i, 1);
    }
  }

  /** Ripples + floaters + distant krathongs also cast light. */
  addOwnLights() {
    const { S } = this.app;
    for (const f of this.floaters) {
      const sc = this.persp(f.y);
      this.addLight(f.x, f.y + 6 * sc, 40 * sc + 6, 26 * sc + 5, 0.3 * Math.min(1, f.age * 2) * Math.min(1, (f.y - this.top) / (this.hgt * 0.15)), S.soft[f.spr.tint]);
    }
    for (const d of this.distant) {
      const y = this.top + d.d * this.hgt;
      this.addLight(d.x, y + 3, 6 + d.d * 40, 5 + d.d * 30, 0.2, S.soft[d.col]);
    }
  }

  // ------------------------------------------------------------ drawing
  renderGlyphLayer(t) {
    const { W, dpr, sky } = this.app;
    const g = this.g;
    const top = this.top;
    const hgt = this.hgt;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const L = this.L;
    const nL = this.nL;
    const RL = this.rowLights;
    const RN = this.rowLightN;
    const rip = this.ripples;
    const nR = rip.length;
    const mx = sky.moonX;
    const mr = sky.moonR;
    const halfW = W * 0.5;

    // which lights touch which rows
    for (let r = 0; r < this.nRows; r++) {
      const yAbs = this.rowY[r] + top;
      let c = 0;
      for (let k = 0; k < nL; k++) {
        const o = k * 5;
        if (Math.abs(yAbs - L[o + 1]) * L[o + 3] < 1) RL[r * MAXL + c++] = k;
      }
      RN[r] = c;
    }

    for (let r = 0; r < this.nRows; r++) {
      const y = this.rowY[r];
      const yAbs = y + top;
      const sp = this.rowSp[r];
      const n = this.rowN[r];
      const x0 = this.rowX0[r];
      const wz = this.rowWz[r];
      const aB = this.rowA[r];
      const sc = this.rowSc[r];
      const tier = this.tiers[this.rowT[r]];
      const rh = this.rowH[r];
      const hw = mr * 0.42 + y * 0.48;
      const invHw2 = 1 / (hw * hw);
      const nl = RN[r];
      const base = r * MAXL;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * sp;
        const wx = (x - halfW) / rh;
        const h =
          0.5 * Math.sin(wx * 0.55 + wz * 0.9 + t * 1.4) +
          0.32 * Math.sin(wx * 0.23 - wz * 1.6 + t * 0.9 + 1.3) +
          0.18 * Math.sin(wx * 1.3 + wz * 2.1 - t * 2.3);
        let I = 0;
        let glint = false;
        const dx = x - mx;
        const m = Math.exp(-dx * dx * invHw2);
        if (m > 0.03) {
          const gl = Math.sin(wx * 2.7 + t * 3.1 + wz * 1.7) * Math.sin(wx * 1.1 - t * 1.9 + wz * 0.6);
          I += m * (0.3 + (gl > 0.25 ? 1.05 : 0.18)) * (h > -0.3 ? 1 : 0.4);
          glint = gl > 0.8 && m > 0.4;
        }
        for (let j = 0; j < nl; j++) {
          const o = RL[base + j] * 5;
          const ddx = (x - L[o]) * L[o + 2];
          const ddy = (yAbs - L[o + 1]) * L[o + 3];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < 1) {
            const f = 1 - d2;
            I += L[o + 4] * f * f * (0.55 + 0.45 * h);
          }
        }
        for (let j = 0; j < nR; j++) {
          const rp = rip[j];
          const ry = (yAbs - rp.y) / rp.flat;
          const rx = x - rp.x;
          const d = Math.sqrt(rx * rx + ry * ry);
          const w = 5 + rp.r * 0.06;
          const q = (d - rp.r) / w;
          if (q > -2 && q < 2) {
            const f = 1 - q * q * 0.25;
            I += rp.a * (rp.life / rp.max) * f * f * 0.9;
          }
        }
        let a = aB * (0.2 + 0.6 * (h * 0.5 + 0.5)) + I * 0.85;
        if (a < 0.07) continue;
        if (a > 1) a = 1;
        const hv = h + I * 0.7;
        const ci = glint ? 4 : hv > 0.62 ? 3 : hv > 0.2 ? 2 : hv > -0.2 ? 1 : 0;
        const s = tier[ci];
        const w = s.w * sc;
        const hh = s.h * sc;
        g.globalAlpha = a;
        g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - w * 0.5, y - hh * 0.5, w, hh);
      }
    }

    // ---- colour: base tint, golden moon column, then every light source
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = this.baseTint;
    g.fillRect(0, 0, W, hgt);
    g.globalAlpha = 0.95;
    g.drawImage(this.moonTint, Math.sin(t * 0.7) * 2, 0, W, hgt);
    for (let k = 0; k < nL; k++) {
      const o = k * 5;
      const spr = this.Lspr[k];
      g.globalAlpha = Math.min(1, L[o + 4] * 2.2);
      const w = (2.6 / L[o + 2]);
      const h = (2.6 / L[o + 3]);
      g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, L[o] - w / 2, L[o + 1] - top - h / 2, w, h);
    }
    const S = this.app.S;
    for (const rp of rip) {
      const spr = S.soft[rp.col];
      const k = rp.life / rp.max;
      g.globalAlpha = Math.min(1, rp.a * k * 1.2);
      const w = (rp.r + 30) * 2.4;
      g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, rp.x - w / 2, rp.y - top - w * rp.flat * 0.5, w, w * rp.flat);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /** Everything on the river surface, back to front. */
  draw(ctx, t, beforeGlyphs) {
    const { W, S } = this.app;
    const top = this.top;
    const hgt = this.hgt;
    const L = this.L;

    // soft colored light pools on the water
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < this.nL; k++) {
      const o = k * 5;
      const spr = this.Lspr[k];
      ctx.globalAlpha = Math.min(0.85, L[o + 4] * 0.55);
      drawSpriteSize(ctx, spr, L[o], L[o + 1], 2.2 / L[o + 2], 2.2 / L[o + 3]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (beforeGlyphs) beforeGlyphs(ctx);

    this.renderGlyphLayer(t);
    ctx.drawImage(this.canvas, 0, top, W, hgt);

    ctx.globalCompositeOperation = 'lighter';
    // bloom over the golden moon path, breathing slowly
    ctx.globalAlpha = 0.16 + 0.04 * Math.sin(t * 0.9);
    ctx.drawImage(this.moonTint, 0, top, W, hgt);
    // moon glints
    for (const gl of this.glints) {
      const k = gl.life / gl.max;
      const a = Math.sin(Math.PI * k);
      ctx.globalAlpha = a * 0.9;
      drawSprite(ctx, S.gly.star4.cream, gl.x, gl.y, gl.s * (0.6 + 0.4 * a));
      ctx.globalAlpha = a * 0.5;
      drawSpriteSize(ctx, S.glow.gold, gl.x, gl.y, 18 * gl.s + 4, 18 * gl.s + 4);
    }
    // neon ripple rings
    ctx.lineCap = 'round';
    for (const rp of this.ripples) {
      const k = rp.life / rp.max;
      for (let j = 0; j < 3; j++) {
        const rr = rp.r - j * rp.gap;
        if (rr <= 1) continue;
        const aj = rp.a * k * (1 - j * 0.3);
        ctx.strokeStyle = `rgba(${rp.rgb},${(0.2 * aj).toFixed(3)})`;
        ctx.lineWidth = 4 * rp.sc;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rr, rr * rp.flat, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${rp.rgb},${(0.85 * aj).toFixed(3)})`;
        ctx.lineWidth = 1.1 * rp.sc + 0.3;
        ctx.stroke();
      }
    }
    // distant krathongs drifting near the horizon
    for (const d of this.distant) {
      const y = top + d.d * hgt;
      const sz = 2.5 + d.d * 22;
      const fl = 0.75 + 0.25 * Math.sin(t * 7 + d.ph);
      ctx.globalAlpha = 0.55 * fl;
      drawSpriteSize(ctx, S.glow[d.col], d.x, y, sz * 2.2, sz * 2.2);
      ctx.globalAlpha = 0.22 * fl;
      drawSpriteSize(ctx, S.soft[d.col], d.x, y + sz * 1.6, sz * 1.1, sz * 4.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // floating mini lotus krathongs released by taps
    const { dpr } = this.app;
    for (const f of this.floaters) {
      const sc = this.persp(f.y);
      const fade = Math.min(1, f.age * 2) * clamp((f.y - top) / (hgt * 0.12), 0, 1);
      const b = f.spr;
      const bob = Math.sin(t * 1.6 + f.ph) * 1.5 * sc;
      const rot = Math.sin(t * 1.2 + f.ph) * 0.06;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * fade;
      drawSpriteSize(ctx, S.soft[b.tint], f.x, f.y + bob - b.Wk * 0.2 * sc, b.Wk * 1.6 * sc, b.Wk * 1.1 * sc);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
      const c = Math.cos(rot) * sc;
      const s = Math.sin(rot) * sc;
      ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, f.x * dpr, (f.y + bob) * dpr);
      ctx.drawImage(b.canvas, -b.w / 2, -b.anchorY, b.w, b.h);
      // tiny candle flame
      ctx.globalCompositeOperation = 'lighter';
      const fl = 0.75 + 0.25 * Math.sin(t * 13 + f.ph * 5);
      drawSpriteSize(ctx, S.glow.gold, 0, b.candleY - b.anchorY - 2, 14 * fl, 18 * fl);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  drawFireflies(ctx, t) {
    const { S } = this.app;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fireflies) {
      const b = 0.5 + 0.5 * Math.sin(t * f.bs + f.bp);
      const a = b * b * b * 0.9 + 0.06;
      ctx.globalAlpha = a;
      const sz = 13 * f.r;
      drawSpriteSize(ctx, S.glow[f.col], f.x, f.y, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
