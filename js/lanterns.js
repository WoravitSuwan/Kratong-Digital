// Yi Peng sky lanterns at three parallax depths + the giant wish lantern.

import { TAU, clamp, lerp, rand, pick, smoothstep, makeCanvas, mulberry32, easeInOutCubic, words, graphemes } from './util.js';
import { MONO, glowify, sprite, drawSprite, drawSpriteSize, PX_HEART } from './sprites.js';

const SCHEMES = [
  { top: '#ff8a5c', mid: '#ffb661', bot: '#ffe7a3', ascii: '#fff3cf', glow: '#ffae5a', aura: 'amber' },
  { top: '#ff6f9e', mid: '#ffa6a0', bot: '#ffe3c6', ascii: '#fff0f2', glow: '#ff8fb0', aura: 'rose' },
  { top: '#ff9a6e', mid: '#ffc27a', bot: '#fff1bd', ascii: '#fffaf0', glow: '#ffc06a', aura: 'gold' },
];

const LAYERS = [
  { n: 17, h: 10, speed: [5, 9], alpha: 0.7, cols: 0, from: 'horizon', refl: 0.05 },
  { n: 12, h: 21, speed: [11, 17], alpha: 0.92, cols: 6, from: 'horizon', refl: 0.12 },
  { n: 5, h: 40, speed: [20, 30], alpha: 1, cols: 9, from: 'bottom', refl: 0.2 },
];

const RAMP = '.:-=+*#';
const FLAME_GLYPHS = ['ast', 'star4', 'plus'];

function lanternHW(v) {
  if (v < 0.22) {
    const k = (0.22 - v) / 0.24;
    return 0.47 * Math.sqrt(Math.max(0, 1 - k * k));
  }
  return lerp(0.47, 0.33, (v - 0.22) / 0.72);
}

function lanternPath(g, cx, top, w, h) {
  g.beginPath();
  g.moveTo(cx - w * 0.33, top + h * 0.94);
  g.lineTo(cx - w * 0.47, top + h * 0.22);
  g.bezierCurveTo(cx - w * 0.47, top - h * 0.03, cx + w * 0.47, top - h * 0.03, cx + w * 0.47, top + h * 0.22);
  g.lineTo(cx + w * 0.33, top + h * 0.94);
  g.ellipse(cx, top + h * 0.94, w * 0.33, h * 0.045, 0, 0, Math.PI, false);
  g.closePath();
}

/** Paint a lantern body (paper glow + ASCII texture) into g. */
function paintLantern(g, cx, top, w, h, sc, cols, seed = 1) {
  lanternPath(g, cx, top, w, h);
  let gr = g.createLinearGradient(0, top, 0, top + h);
  gr.addColorStop(0, sc.top);
  gr.addColorStop(0.55, sc.mid);
  gr.addColorStop(1, sc.bot);
  g.fillStyle = gr;
  g.globalAlpha = 0.93;
  g.fill();
  g.globalAlpha = 1;

  g.save();
  lanternPath(g, cx, top, w, h);
  g.clip();
  g.globalCompositeOperation = 'lighter';
  gr = g.createRadialGradient(cx, top + h * 0.98, 0, cx, top + h * 0.98, h * 0.85);
  gr.addColorStop(0, 'rgba(255,244,210,0.75)');
  gr.addColorStop(0.5, 'rgba(255,220,160,0.22)');
  gr.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = gr;
  g.fillRect(cx - w, top - h * 0.1, w * 2, h * 1.2);
  g.globalCompositeOperation = 'source-over';
  // bamboo ribs
  g.strokeStyle = 'rgba(130,40,40,0.2)';
  g.lineWidth = Math.max(0.5, h * 0.016);
  for (const s of [-0.24, 0, 0.24]) {
    g.beginPath();
    g.moveTo(cx + s * w * 0.95, top + h * 0.04);
    g.lineTo(cx + s * w * 0.7, top + h * 0.95);
    g.stroke();
  }
  g.restore();

  if (cols > 0) {
    const rnd = mulberry32(seed);
    const cw = w / cols;
    const ch = cw * 1.45;
    const rows = Math.max(3, Math.floor((h * 0.95) / ch));
    g.font = `700 ${(ch * 0.98).toFixed(2)}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = sc.ascii;
    for (let r = 0; r < rows; r++) {
      const v = (r + 0.5) / rows;
      const hw = lanternHW(v * 0.95);
      for (let c = 0; c < cols; c++) {
        const u = ((c + 0.5) / cols) * 2 - 1;
        const uu = u * 0.5;
        if (Math.abs(uu) > hw * 0.9) continue;
        const b = 0.2 + 0.8 * Math.pow(v, 1.3) * (1 - 0.45 * (uu / hw) ** 2) + (rnd() - 0.5) * 0.12;
        const idx = clamp(Math.round(b * (RAMP.length - 1)), 0, RAMP.length - 1);
        g.globalAlpha = clamp(0.3 + 0.55 * b, 0, 1);
        g.fillText(RAMP[idx], cx + uu * w, top + h * 0.03 + (r + 0.5) * ch);
      }
    }
    g.globalAlpha = 1;
  }

  // bottom rim
  g.strokeStyle = 'rgba(255,250,225,0.75)';
  g.lineWidth = Math.max(0.6, h * 0.022);
  g.beginPath();
  g.ellipse(cx, top + h * 0.94, w * 0.33, h * 0.045, 0, 0, TAU);
  g.stroke();
}

function buildLanternSprite(h, sc, dpr, cols, seed) {
  const w = h * 0.74;
  const m = Math.ceil(h * 0.24) + 2;
  const W = w + m * 2;
  const H = h + m * 2;
  const c = makeCanvas(W * dpr, H * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  paintLantern(g, W / 2, m, w, h, sc, cols, seed);
  const out = glowify(c, sc.glow, dpr, [[Math.max(3, h * 0.2), 0.75]]);
  const s = sprite(out, W, H);
  s.flameDY = m + h * 0.97 - H / 2; // flame offset from sprite center
  s.bodyH = h;
  return s;
}

/** Wrap text (Thai-aware) to fit maxW; returns lines. */
function wrapText(g, text, maxW) {
  const lines = [];
  for (const para of text.split(/\n+/)) {
    let line = '';
    for (const w of words(para)) {
      const test = line + w;
      if (g.measureText(test).width <= maxW || !line.trim()) {
        if (g.measureText(test).width > maxW) {
          // a single word longer than the line: break by graphemes
          for (const gph of graphemes(w)) {
            if (g.measureText(line + gph).width > maxW && line) {
              lines.push(line);
              line = gph;
            } else line += gph;
          }
        } else line = test;
      } else {
        lines.push(line.trim());
        line = w.trimStart();
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

class WishLantern {
  constructor(app, text) {
    this.app = app;
    this.text = text;
    this.t = 0;
    this.dur = 17;
    this.done = false;
    this.ph = Math.random() * TAU;
    this.build();
    this.x = this.p0[0];
    this.y = this.p0[1];
    this.s = 1;
    this.alpha = 0;
    this.sparkT = 0;
  }

  build() {
    const { W, H, dpr, waterY, Wk, sky } = this.app;
    const w = clamp(W * 0.46, 150, 230);
    const h = w * 1.3;
    const m = Math.ceil(w * 0.3);
    const CW = w + m * 2;
    const CH = h + m * 2;
    const c = makeCanvas(CW * dpr, CH * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const sc = { top: '#ff6f9e', mid: '#ffae96', bot: '#ffecb8', ascii: '#fff4e6', glow: '#ff9ab8' };
    const cx = CW / 2;
    const top = m;
    paintLantern(g, cx, top, w, h, sc, 16, 9);

    // paper panel for legibility
    g.save();
    lanternPath(g, cx, top, w, h);
    g.clip();
    const gr = g.createRadialGradient(cx, top + h * 0.56, 0, cx, top + h * 0.56, w * 0.55);
    gr.addColorStop(0, 'rgba(255,248,232,0.78)');
    gr.addColorStop(0.75, 'rgba(255,240,220,0.45)');
    gr.addColorStop(1, 'rgba(255,236,210,0)');
    g.fillStyle = gr;
    g.fillRect(cx - w, top, w * 2, h);
    g.restore();

    // pixel heart emblem
    const p = Math.max(1.6, w / 62);
    const hx = cx - (PX_HEART[0].length * p) / 2;
    const hy = top + h * 0.13;
    for (let r = 0; r < PX_HEART.length; r++) {
      for (let k = 0; k < PX_HEART[r].length; k++) {
        const key = PX_HEART[r][k];
        if (key === '.') continue;
        g.fillStyle = key === 'w' ? '#ffffff' : '#ff3f8f';
        g.fillRect(hx + k * p, hy + r * p, p * 0.92, p * 0.92);
      }
    }

    // the wish itself
    const maxW = w * 0.68;
    const maxH = h * 0.5;
    let fs = 19;
    let lines = [];
    for (; fs >= 11; fs -= 1) {
      g.font = `700 ${fs}px Mali, "Noto Sans Thai", Thonburi, sans-serif`;
      lines = wrapText(g, this.text, maxW);
      if (lines.length * fs * 1.38 <= maxH) break;
    }
    const maxLines = Math.max(1, Math.floor(maxH / (fs * 1.38)));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      const last = graphemes(lines[maxLines - 1]);
      last.pop();
      lines[maxLines - 1] = last.join('') + '…';
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = fs * 1.38;
    const ty = top + h * 0.58 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText(ln, cx, ty + i * lh + 1);
      g.fillStyle = '#7a1240';
      g.fillText(ln, cx, ty + i * lh);
    });

    // tassels
    g.strokeStyle = 'rgba(255,214,110,0.9)';
    g.lineWidth = 1.2;
    for (const s of [-0.26, 0.26]) {
      const x0 = cx + s * w;
      g.beginPath();
      g.moveTo(x0, top + h * 0.9);
      g.quadraticCurveTo(x0 + s * 6, top + h * 1.02, x0, top + h * 1.1);
      g.stroke();
      g.fillStyle = '#ffd36e';
      g.font = `700 ${Math.max(8, w * 0.06)}px ${MONO}`;
      g.fillText('¤', x0, top + h * 1.13);
    }

    const out = glowify(c, '#ff9ab8', dpr, [
      [w * 0.12, 0.8],
      [w * 0.035, 0.7],
    ]);
    this.spr = sprite(out, CW, CH);
    this.flameDY = m + h * 0.97 - CH / 2;
    this.h = h;

    const startY = Math.min(waterY - Wk * 0.95 - h * 0.5, H * 0.6);
    this.p0 = [W / 2, startY];
    this.p1 = [W * 0.2, H * 0.42];
    this.p2 = [sky.moonX - W * 0.12, sky.moonY + sky.moonR * 2.6];
    this.p3 = [sky.moonX, sky.moonY + sky.moonR * 0.1];
  }

  update(dt) {
    this.t += dt;
    const u = clamp(this.t / this.dur, 0, 1);
    const p = easeInOutCubic(u);
    const mt = 1 - p;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * p;
    const c = 3 * mt * p * p;
    const d = p * p * p;
    this.x = a * this.p0[0] + b * this.p1[0] + c * this.p2[0] + d * this.p3[0] + Math.sin(this.t * 0.7 + this.ph) * 6 * (1 - p);
    this.y = a * this.p0[1] + b * this.p1[1] + c * this.p2[1] + d * this.p3[1];
    this.s = lerp(1, 0.07, Math.pow(p, 0.85));
    this.rot = Math.sin(this.t * 1.1 + this.ph) * 0.06 * (0.4 + 0.6 * this.s);
    this.alpha = Math.min(1, this.t / 1.1) * (1 - smoothstep(0.86, 1, u));
    this.y += (1 - Math.min(1, this.t / 1.6)) ** 2 * 40;
    if (u >= 1 && !this.done) {
      this.done = true;
      this.app.onWishArrive?.(this);
    }
    // golden stardust trail
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.alpha > 0.1) {
      this.sparkT = 0.05;
      const fx = this.app.fxTop;
      const fy = this.y + this.flameDY * this.s;
      fx.sparkle(this.x + rand(-8, 8) * this.s, fy, 1, ['gold', 'cream', 'rose', 'peach'], 26, { g: 22, life: [0.8, 1.6], scale: 0.8 });
    }
  }
}

export class Lanterns {
  constructor(app) {
    this.app = app;
    this.list = [];
    this.minis = [];
    this.wishes = [];
    this.lastW = 0;
    this.lastH = 0;
  }

  layout() {
    const { W, H, dpr } = this.app;
    const base = clamp(Math.min(W, H * 0.6) / 390, 0.85, 1.55);
    this.base = base;
    this.sprites = LAYERS.map((L, li) => SCHEMES.map((sc, si) => buildLanternSprite(L.h * base, sc, dpr, L.cols, 31 + li * 7 + si)));
    this.wishes.forEach((w) => w.build());

    if (this.list.length && this.lastW) {
      const sx = W / this.lastW;
      const sy = H / this.lastH;
      for (const L of this.list) {
        L.x *= sx;
        L.y *= sy;
        this.assignSprite(L);
      }
    } else {
      this.populate();
    }
    this.lastW = W;
    this.lastH = H;
  }

  populate() {
    const { W } = this.app;
    const widthFactor = clamp(Math.pow(W / 390, 0.65), 1, 2.4);
    this.list = [];
    this.byLayer = [[], [], []];
    LAYERS.forEach((L, li) => {
      const n = Math.round(L.n * widthFactor);
      for (let i = 0; i < n; i++) {
        const lan = this.makeLantern(li);
        lan.y = lerp(this.topY(), lan.spawnY, Math.random());
        this.list.push(lan);
        this.byLayer[li].push(lan);
      }
    });
  }

  topY() {
    return -60;
  }

  makeLantern(li) {
    const { W, H, horizonY } = this.app;
    const L = LAYERS[li];
    const lan = {
      layer: li,
      x: rand(-0.04, 1.04) * W,
      y: 0,
      vy: rand(L.speed[0], L.speed[1]) * this.base,
      sway: rand(0.6, 1.4),
      swayF: rand(0.35, 0.8),
      ph: Math.random() * TAU,
      scheme: (Math.random() * SCHEMES.length) | 0,
      flickPh: Math.random() * 100,
      sizeJ: rand(0.8, 1.2),
      spawnY: L.from === 'horizon' ? horizonY - rand(2, 30) : H + 70,
      fade: 1,
      rot: 0,
      sc: 1,
    };
    this.assignSprite(lan);
    return lan;
  }

  assignSprite(lan) {
    lan.spr = this.sprites[lan.layer][lan.scheme];
  }

  respawn(lan) {
    const fresh = this.makeLantern(lan.layer);
    Object.assign(lan, fresh, { y: fresh.spawnY });
  }

  /** Small lantern released from a tap on the water. */
  addMini(x, y) {
    const lan = this.makeLantern(2);
    lan.x = x;
    lan.y = y;
    lan.spawnY = y;
    lan.vy = rand(34, 46) * this.base;
    lan.sizeJ = 0.55;
    lan.mini = true;
    lan.age = 0;
    this.minis.push(lan);
    if (this.minis.length > 12) this.minis.shift();
  }

  async addWish(text) {
    try {
      await Promise.race([document.fonts.load('700 18px Mali', text), new Promise((r) => setTimeout(r, 1200))]);
    } catch (e) {
      /* fall back to system font */
    }
    const w = new WishLantern(this.app, text);
    this.wishes.push(w);
    return w;
  }

  update(dt, t) {
    const top = this.topY();
    const wind = 3 + Math.sin(t * 0.05) * 2;
    for (const lan of this.list) {
      lan.y -= lan.vy * dt;
      lan.x += (wind * (0.4 + lan.layer * 0.3) + Math.sin(t * lan.swayF + lan.ph) * lan.sway * 6) * dt;
      lan.rot = Math.sin(t * lan.swayF * 1.3 + lan.ph) * 0.07;
      const rise = clamp((lan.spawnY - lan.y) / Math.max(1, lan.spawnY - top), 0, 1);
      lan.sc = lan.sizeJ * (1 - 0.32 * rise);
      const fadeIn = LAYERS[lan.layer].from === 'horizon' ? smoothstep(0, 26, lan.spawnY - lan.y) : 1;
      lan.fade = fadeIn * smoothstep(top, top + 110, lan.y);
      if (lan.y < top || lan.x > this.app.W + 60) this.respawn(lan);
    }
    for (let i = this.minis.length - 1; i >= 0; i--) {
      const lan = this.minis[i];
      lan.age += dt;
      lan.y -= lan.vy * dt;
      lan.x += (wind * 0.8 + Math.sin(t * lan.swayF + lan.ph) * 8) * dt;
      lan.rot = Math.sin(t * lan.swayF * 1.3 + lan.ph) * 0.08;
      const rise = clamp((lan.spawnY - lan.y) / Math.max(1, lan.spawnY - top), 0, 1);
      lan.sc = lan.sizeJ * (1 - 0.45 * rise);
      lan.fade = Math.min(1, lan.age / 0.6) * smoothstep(top, top + 140, lan.y);
      if (lan.y < top) this.minis.splice(i, 1);
    }
    for (let i = this.wishes.length - 1; i >= 0; i--) {
      const w = this.wishes[i];
      w.update(dt);
      if (w.t > w.dur + 0.5) this.wishes.splice(i, 1);
    }
  }

  /** Feed lantern reflections into the water light list. */
  addLights(water) {
    const { horizonY: hy, H, S } = this.app;
    const consider = (lan, weight) => {
      if (lan.y > hy - 4) return;
      const ry = hy + (hy - lan.y) * 0.62;
      if (ry > H + 20) return;
      const size = lan.spr.bodyH * lan.sc;
      water.addLight(lan.x, ry, size * 1.4 + 10, size * 1.6 + 14, weight * lan.fade, S.soft[SCHEMES[lan.scheme].aura]);
    };
    for (const w of this.wishes) {
      if (w.y < hy) {
        const ry = hy + (hy - w.y) * 0.62;
        if (ry < H + 30) water.addLight(w.x, ry, w.h * w.s * 1.2 + 20, w.h * w.s * 1.4 + 20, 0.45 * w.alpha, S.soft.rose);
      }
    }
    for (const lan of this.minis) consider(lan, 0.25);
    for (const lan of this.byLayer[2]) consider(lan, LAYERS[2].refl);
    for (const lan of this.byLayer[1]) consider(lan, LAYERS[1].refl);
  }

  drawLayer(ctx, layer, t) {
    const { S, dpr } = this.app;
    const sel = layer === 3 ? this.minis : this.byLayer[layer];
    if (!sel.length) return;
    // auras
    ctx.globalCompositeOperation = 'lighter';
    for (const lan of sel) {
      const fl = 0.78 + 0.22 * Math.sin(t * 9 + lan.flickPh) * Math.sin(t * 5.3 + lan.flickPh * 1.7);
      lan.fl = fl;
      const sz = lan.spr.bodyH * lan.sc * 2.8;
      ctx.globalAlpha = 0.32 * lan.fade * fl * LAYERS[lan.layer].alpha;
      drawSpriteSize(ctx, S.soft[SCHEMES[lan.scheme].aura], lan.x, lan.y + lan.spr.flameDY * lan.sc * 0.4, sz, sz * 1.1);
    }
    // bodies
    ctx.globalCompositeOperation = 'source-over';
    for (const lan of sel) {
      const s = lan.spr;
      const c = Math.cos(lan.rot) * lan.sc;
      const sn = Math.sin(lan.rot) * lan.sc;
      ctx.globalAlpha = lan.fade * LAYERS[lan.layer].alpha;
      ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, lan.x * dpr, lan.y * dpr);
      ctx.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // flickering ASCII flame cores
    ctx.globalCompositeOperation = 'lighter';
    for (const lan of sel) {
      const s = lan.spr;
      const fx = lan.x - Math.sin(lan.rot) * s.flameDY * lan.sc;
      const fy = lan.y + Math.cos(lan.rot) * s.flameDY * lan.sc;
      const sz = s.bodyH * lan.sc;
      ctx.globalAlpha = lan.fade * (0.55 + 0.45 * lan.fl);
      drawSpriteSize(ctx, S.glow.gold, fx, fy, sz * 0.9 * lan.fl, sz * 0.9 * lan.fl);
      if (lan.layer > 0) {
        const gk = FLAME_GLYPHS[(Math.floor(t * 11 + lan.flickPh) % 3 + 3) % 3];
        drawSprite(ctx, S.gly[gk].cream, fx, fy - sz * 0.03, (sz / 40) * 0.75 * (0.85 + 0.25 * lan.fl));
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawWishes(ctx, t) {
    if (!this.wishes.length) return;
    const { S, dpr } = this.app;
    for (const w of this.wishes) {
      if (w.alpha <= 0.01) continue;
      const fl = 0.8 + 0.2 * Math.sin(t * 10 + w.ph) * Math.sin(t * 6.1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * w.alpha * fl;
      const asz = w.h * w.s * 3;
      drawSpriteSize(ctx, S.soft.rose, w.x, w.y, asz, asz * 1.1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = w.alpha;
      const c = Math.cos(w.rot) * w.s;
      const sn = Math.sin(w.rot) * w.s;
      ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, w.x * dpr, w.y * dpr);
      ctx.drawImage(w.spr.img, -w.spr.w / 2, -w.spr.h / 2, w.spr.w, w.spr.h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fx = w.x - Math.sin(w.rot) * w.flameDY * w.s;
      const fy = w.y + Math.cos(w.rot) * w.flameDY * w.s;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = w.alpha * (0.6 + 0.4 * fl);
      const fsz = w.h * w.s * 0.55 * fl;
      drawSpriteSize(ctx, S.glow.gold, fx, fy, fsz, fsz);
      drawSprite(ctx, S.gly[FLAME_GLYPHS[Math.floor(t * 11) % 3]].cream, fx, fy, Math.max(0.3, w.s * 1.3));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
}
