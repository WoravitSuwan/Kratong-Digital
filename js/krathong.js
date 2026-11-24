// The two hero krathongs: procedurally composed ASCII lotus bodies with
// candle, incense and flowers, neon pixel-font usernames, orbiting hearts,
// water physics, stardust trails and the "float together" heart aura.

import { TAU, clamp, lerp, rand, pick, damp, makeCanvas, mixHex, rgba } from './util.js';
import { MONO, HEART, glowify, sprite, drawSprite, drawSpriteSize, pixelTextSprite } from './sprites.js';
import { heartXY } from './particles.js';

export const SCHEMES = {
  her: {
    tiers: [
      { edge: '#ffb0d2', fill: '#ffd9ea', tip: '#fff4fa' },
      { edge: '#ff7fbf', fill: '#ffb6da', tip: '#ffe6f2' },
      { edge: '#ff4fa8', fill: '#ff8cc6', tip: '#ffd1e8' },
    ],
    baseTop: '#ffc6ae',
    baseRim: '#f59aaa',
    baseBody: '#e0749f',
    baseShadow: '#9b3570',
    candle: '#fff3ec',
    candleShade: '#ffc9d9',
    incense: '#e7b27e',
    flowers: [
      ['✿', '#fff3f8'],
      ['❀', '#ffd36e'],
      ['✿', '#ff9ad1'],
      ['❀', '#fff3f8'],
    ],
    center: [HEART, '#ff3f8f'],
    backing: 'rgba(38,8,34,0.84)',
    glow: '#ff5fb0',
    neon: '#ff3fa4',
    core: '#fff0f8',
    tint: 'pink',
    trail: ['sakura', 'pink', 'white', 'rose', 'gold'],
    hearts: ['pink', 'rose', 'magenta', 'white'],
  },
  his: {
    tiers: [
      { edge: '#c3b0ff', fill: '#e2d8ff', tip: '#f6f2ff' },
      { edge: '#7f95ff', fill: '#b0bcff', tip: '#e8ebff' },
      { edge: '#38b6ff', fill: '#7fd6ff', tip: '#d9f7ff' },
    ],
    baseTop: '#a6ecff',
    baseRim: '#7d97ff',
    baseBody: '#4e66e6',
    baseShadow: '#26318f',
    candle: '#f0f7ff',
    candleShade: '#c6d6ff',
    incense: '#d8b88e',
    flowers: [
      ['✿', '#effcff'],
      ['❀', '#8ff3ff'],
      ['✿', '#c8b6ff'],
      ['❀', '#effcff'],
    ],
    center: ['✦', '#8ff6ff'],
    backing: 'rgba(6,12,46,0.84)',
    glow: '#3fbaff',
    neon: '#22dcff',
    core: '#eefdff',
    tint: 'cyan',
    trail: ['cyan', 'lavender', 'white', 'ice', 'blue'],
    hearts: ['cyan', 'lavender', 'blue', 'white'],
  },
};

const GOLD = {
  tiers: [
    { edge: '#ffe08a', fill: '#fff0c2', tip: '#fffaf0' },
    { edge: '#ffc85a', fill: '#ffe0a0', tip: '#fff3d6' },
    { edge: '#ffab4a', fill: '#ffd08a', tip: '#ffeccc' },
  ],
  baseTop: '#ffe3a8',
  baseRim: '#f2b76a',
  baseBody: '#d98c3e',
  baseShadow: '#8a4f1c',
  candle: '#fff8ea',
  candleShade: '#ffe0b0',
  backing: 'rgba(40,20,6,0.82)',
  glow: '#ffc35a',
  tint: 'gold',
};
const LAV = {
  tiers: [
    { edge: '#e0c8ff', fill: '#f0e6ff', tip: '#fcf8ff' },
    { edge: '#c3a6ff', fill: '#dccbff', tip: '#f4eeff' },
    { edge: '#a37bff', fill: '#c4a8ff', tip: '#ece2ff' },
  ],
  baseTop: '#ffd1f0',
  baseRim: '#c9a0ff',
  baseBody: '#8f68e8',
  baseShadow: '#4b2d99',
  candle: '#fbf6ff',
  candleShade: '#e3d4ff',
  backing: 'rgba(26,10,48,0.82)',
  glow: '#b58cff',
  tint: 'lavender',
};
export const MINI_SCHEMES = [SCHEMES.her, SCHEMES.his, GOLD, LAV];

// Lotus geometry in Wk-relative units: X ∈ ±0.62 (0 = centre), Y ↓ from the
// body top. Petals are pointed vesicas fanned outward so the krathong reads
// as an opening lotus cup sitting on a banana-trunk base.
const TIER_DEFS = [
  { n: 3, spread: 0.09, Yb: 0.6, L: 0.4, hw: 0.068, k: 2.6, shrink: 0 }, // inner (back)
  { n: 5, spread: 0.26, Yb: 0.66, L: 0.38, hw: 0.078, k: 2.2, shrink: 0.08 }, // middle
  { n: 7, spread: 0.4, Yb: 0.71, L: 0.33, hw: 0.082, k: 2.1, shrink: 0.25 }, // outer (front)
];
const BASE = { cy: 0.71, rx: 0.47, ry: 0.045, thick: 0.1 };
const ANCHOR = 0.79;
const CANDLE = { hw: 0.036, top: 0.05, bot: 0.6 };
const GRID_X0 = -0.62;
const BODY_H = 0.87;

const petalW = (s) => Math.pow(Math.sin(Math.PI * clamp(s * 0.9 + 0.1, 0, 1)), 0.7);

function makePetals(S) {
  return TIER_DEFS.map((T, ti) => {
    const list = [];
    for (let i = 0; i < T.n; i++) {
      const Xb = -T.spread + (2 * T.spread * i) / (T.n - 1);
      const th = Xb * T.k;
      list.push({
        Xb,
        Yb: T.Yb + (Math.abs(Xb) / T.spread) * 0.015,
        L: T.L * (1 - (T.shrink * Math.abs(Xb)) / T.spread),
        hw: T.hw,
        th,
        dx: Math.sin(th),
        dy: -Math.cos(th),
        nx: Math.cos(th),
        ny: Math.sin(th),
        C: S.tiers[ti],
      });
    }
    // draw order: sides first, centre petal last (nearest the viewer)
    list.sort((a, b) => Math.abs(b.Xb) - Math.abs(a.Xb));
    return list;
  });
}

/** Map a direction to the ASCII stroke that best follows it. */
function strokeChar(tx, ty) {
  if (ty > 0) {
    tx = -tx;
    ty = -ty;
  }
  const len = Math.hypot(tx, ty) || 1;
  const ax = Math.abs(tx) / len;
  if (ax < 0.38) return '|';
  if (ax > 0.92) return '-';
  return tx > 0 ? '/' : '\\';
}

function petalCell(P, X, Y, cellX) {
  const dX = X - P.Xb;
  const dY = Y - P.Yb;
  const along = dX * P.dx + dY * P.dy;
  const perp = dX * P.nx + dY * P.ny;
  const s = along / P.L;
  if (s < -0.02 || s > 1) return null;
  const w = P.hw * petalW(s);
  if (Math.abs(perp) > w + cellX * 0.3) return null;
  const C = P.C;
  if (s > 0.86) return ['^', C.tip, Math.abs(perp) / (w + 1e-4)];
  if (Math.abs(perp) > w - cellX * 0.62) {
    const sign = perp < 0 ? -1 : 1;
    const dw = (P.hw * (petalW(Math.min(1, s + 0.03)) - petalW(Math.max(0, s - 0.03)))) / 0.06;
    const tx = P.dx * P.L + P.nx * sign * dw;
    const ty = P.dy * P.L + P.ny * sign * dw;
    return [strokeChar(tx, ty), mixHex(C.edge, '#ffffff', 0.35), 1];
  }
  if (Math.abs(perp) < w * 0.22 && s > 0.12) return [strokeChar(P.dx, P.dy), mixHex(C.tip, '#ffffff', 0.4), 0];
  return [s > 0.5 ? ':' : '.', mixHex(C.tip, '#ffffff', clamp((s - 0.3) * 1.2, 0, 0.8)), Math.abs(perp) / (w + 1e-4)];
}

function petalPath(g, P, Wk, ox, oy) {
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const w = P.hw * petalW(s);
    pts.push([P.Xb + P.dx * P.L * s - P.nx * w, P.Yb + P.dy * P.L * s - P.ny * w]);
  }
  for (let i = N; i >= 0; i--) {
    const s = i / N;
    const w = P.hw * petalW(s);
    pts.push([P.Xb + P.dx * P.L * s + P.nx * w, P.Yb + P.dy * P.L * s + P.ny * w]);
  }
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * Wk, oy + y * Wk) : g.moveTo(ox + x * Wk, oy + y * Wk)));
  g.closePath();
}

function basePath(g, Wk, ox, oy) {
  const { cy, rx, ry, thick } = BASE;
  g.beginPath();
  g.ellipse(ox, oy + cy * Wk, rx * Wk, ry * Wk, 0, Math.PI, 0);
  g.lineTo(ox + rx * Wk, oy + (cy + thick) * Wk);
  g.ellipse(ox, oy + (cy + thick) * Wk, rx * Wk, ry * Wk, 0, 0, Math.PI);
  g.closePath();
}

/**
 * Build one krathong body sprite.
 * Returns { canvas, w, h, m, Wk, bodyH, anchorY, candleY, tips } in CSS px
 * (canvas is at device resolution).
 */
export function buildKrathongBody(S, Wk, dpr, opts = {}) {
  const cols = opts.cols || 34;
  const incense = opts.incense !== false;
  const flowers = opts.flowers !== false;
  const side = opts.incenseSide || -1;
  const cellX = 1 / cols;
  const cellY = cellX * 1.5;
  const gridCols = Math.ceil((-GRID_X0 * 2) / cellX);
  const rows = Math.ceil(BODY_H / cellY);
  const cw = Wk * cellX;
  const ch = Wk * cellY;
  const m = Math.ceil(Wk * 0.16);
  const w = Wk + m * 2;
  const bodyH = rows * ch;
  const h = bodyH + m * 2;
  const ox = m + Wk / 2; // x of X=0
  const oy = m; // y of Y=0
  const petals = makePetals(S);
  const [inner, middle, outer] = petals;

  const sticks = incense
    ? [
        [0.25, 0.03],
        [0.2, 0.0],
        [0.15, 0.04],
      ].map(([xt, yt]) => ({ xt: side * xt, yt, xb: side * 0.08, yb: 0.46 }))
    : [];
  const tips = sticks.map((s) => ({ x: ox + s.xt * Wk, y: oy + s.yt * Wk + ch * 0.4 }));

  // ---- classify every character cell (front-most wins)
  const cells = [];
  const findIn = (list, X, Y) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = petalCell(list[i], X, Y, cellX);
      if (r) return r;
    }
    return null;
  };
  for (let r = 0; r < rows; r++) {
    const Y = (r + 0.5) * cellY;
    for (let c = 0; c < gridCols; c++) {
      const X = GRID_X0 + (c + 0.5) * cellX;
      let res = null;
      const topEdge = BASE.cy + BASE.ry * Math.sqrt(Math.max(0, 1 - (X / BASE.rx) ** 2));
      if (Math.abs(X) <= BASE.rx && Y >= topEdge && Y <= topEdge + BASE.thick) {
        const wt = (Y - topEdge) / BASE.thick;
        if (wt < 0.36) res = [c % 2 ? '/' : '\\', S.baseTop];
        else if (wt > 0.74) res = ['_', S.baseShadow];
        else res = [c % 3 === 0 ? '≡' : '=', S.baseBody];
      }
      if (!res) res = findIn(outer, X, Y);
      if (!res) res = findIn(middle, X, Y);
      if (!res && Math.abs(X) < CANDLE.hw && Y >= CANDLE.top && Y <= CANDLE.bot) {
        res = [Y < CANDLE.top + cellY ? '▄' : '█', X > 0.008 ? S.candleShade : S.candle];
      }
      if (!res) {
        for (const s of sticks) {
          if (Y < s.yt || Y > s.yb) continue;
          const xs = lerp(s.xt, s.xb, (Y - s.yt) / (s.yb - s.yt));
          if (Math.abs(X - xs) < cellX * 0.55) {
            res = Y - s.yt < cellY ? ['•', '#ff7a45'] : [strokeChar(s.xb - s.xt, s.yb - s.yt), S.incense || '#e7b27e'];
            break;
          }
        }
      }
      if (!res) res = findIn(inner, X, Y);
      if (!res && (X / BASE.rx) ** 2 + ((Y - BASE.cy) / BASE.ry) ** 2 <= 1) res = ['~', S.baseRim];
      if (res) cells.push([c, r, res[0], res[1]]);
    }
  }

  const c = makeCanvas(w * dpr, h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const gx0 = ox + GRID_X0 * Wk;

  // ---- smooth vector silhouette underneath the glyphs (back → front)
  const paintPetal = (P) => {
    petalPath(g, P, Wk, ox, oy);
    g.fillStyle = S.backing;
    g.fill();
    const tipX = ox + (P.Xb + P.dx * P.L) * Wk;
    const tipY = oy + (P.Yb + P.dy * P.L) * Wk;
    const gr = g.createLinearGradient(ox + P.Xb * Wk, oy + P.Yb * Wk, tipX, tipY);
    gr.addColorStop(0, rgba(P.C.edge, 0.62));
    gr.addColorStop(0.55, rgba(P.C.fill, 0.42));
    gr.addColorStop(1, rgba(P.C.tip, 0.55));
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = rgba(P.C.tip, 0.9);
    g.lineWidth = Math.max(0.7, Wk * 0.008);
    g.stroke();
  };
  basePath(g, Wk, ox, oy);
  g.fillStyle = S.backing;
  g.fill();
  inner.forEach(paintPetal);
  if (incense) {
    g.strokeStyle = rgba(S.incense || '#e7b27e', 0.55);
    g.lineWidth = Math.max(0.8, Wk * 0.008);
    for (const s of sticks) {
      g.beginPath();
      g.moveTo(ox + s.xt * Wk, oy + s.yt * Wk);
      g.lineTo(ox + s.xb * Wk, oy + s.yb * Wk);
      g.stroke();
    }
  }
  const cgr = g.createLinearGradient(ox - CANDLE.hw * Wk, 0, ox + CANDLE.hw * Wk, 0);
  cgr.addColorStop(0, S.candle);
  cgr.addColorStop(1, S.candleShade);
  g.fillStyle = cgr;
  g.globalAlpha = 0.55;
  g.fillRect(ox - CANDLE.hw * Wk, oy + CANDLE.top * Wk, CANDLE.hw * 2 * Wk, (CANDLE.bot - CANDLE.top) * Wk);
  g.globalAlpha = 1;
  middle.forEach(paintPetal);
  outer.forEach(paintPetal);
  basePath(g, Wk, ox, oy);
  const bgr = g.createLinearGradient(0, oy + BASE.cy * Wk, 0, oy + (BASE.cy + BASE.thick + BASE.ry) * Wk);
  bgr.addColorStop(0, rgba(S.baseTop, 0.55));
  bgr.addColorStop(1, rgba(S.baseBody, 0.6));
  g.save();
  g.clip();
  g.fillStyle = S.backing;
  g.fillRect(0, oy + (BASE.cy + BASE.ry * 0.2) * Wk, w, BASE.thick * 2 * Wk);
  g.fillStyle = bgr;
  g.fillRect(0, oy + (BASE.cy + BASE.ry * 0.2) * Wk, w, BASE.thick * 2 * Wk);
  g.restore();

  // ---- ASCII layer
  g.font = `700 ${(ch * 0.98).toFixed(2)}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [col, row, chr, color] of cells) {
    g.fillStyle = color;
    g.fillText(chr, gx0 + (col + 0.5) * cw, oy + (row + 0.5) * ch);
  }

  // ---- flowers & emblem
  if (flowers && S.flowers) {
    const spots = [
      [-0.21, 0.34, 1.7],
      [0.21, 0.34, 1.7],
      [-0.115, 0.27, 1.35],
      [0.115, 0.27, 1.35],
      [-0.33, 0.47, 1.35],
      [0.33, 0.47, 1.35],
    ];
    spots.forEach(([X, Y, sz], i) => {
      const x = ox + X * Wk;
      const y = oy + Y * Wk;
      g.fillStyle = S.backing;
      g.beginPath();
      g.arc(x, y, ch * sz * 0.36, 0, TAU);
      g.fill();
      const [chr, col] = S.flowers[i % S.flowers.length];
      g.font = `700 ${(ch * sz).toFixed(2)}px ${MONO}`;
      g.fillStyle = col;
      g.fillText(chr, x, y);
    });
    if (S.center) {
      const x = ox;
      const y = oy + 0.5 * Wk;
      g.fillStyle = S.backing;
      g.beginPath();
      g.arc(x, y, ch * 0.62, 0, TAU);
      g.fill();
      g.font = `700 ${(ch * 1.5).toFixed(2)}px ${MONO}`;
      g.fillStyle = S.center[1];
      g.fillText(S.center[0], x, y);
    }
  }

  const out = glowify(c, S.glow, dpr, [
    [Wk * 0.07, 0.7],
    [Wk * 0.02, 0.85],
  ]);
  return {
    canvas: out,
    w,
    h,
    m,
    Wk,
    bodyH,
    anchorY: oy + ANCHOR * Wk,
    candleY: oy + CANDLE.top * Wk,
    tips,
  };
}

function buildFlame(fh, dpr) {
  const fw = fh * 0.58;
  const pad = Math.ceil(fh * 0.25);
  const w = fw + pad * 2;
  const h = fh + pad * 2;
  const c = makeCanvas(w * dpr, h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const cx = w / 2;
  const top = pad;
  g.beginPath();
  g.moveTo(cx, top);
  g.bezierCurveTo(cx + fw * 0.55, top + fh * 0.45, cx + fw * 0.52, top + fh, cx, top + fh);
  g.bezierCurveTo(cx - fw * 0.52, top + fh, cx - fw * 0.55, top + fh * 0.45, cx, top);
  const gr = g.createRadialGradient(cx, top + fh * 0.74, 0, cx, top + fh * 0.6, fh * 0.6);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, '#fff4c4');
  gr.addColorStop(0.55, '#ffc865');
  gr.addColorStop(0.85, 'rgba(255,120,70,0.9)');
  gr.addColorStop(1, 'rgba(255,80,80,0.2)');
  g.fillStyle = gr;
  g.fill();
  g.fillStyle = 'rgba(140,170,255,0.55)';
  g.beginPath();
  g.ellipse(cx, top + fh * 0.9, fw * 0.16, fh * 0.08, 0, 0, TAU);
  g.fill();
  const out = glowify(c, '#ffb04a', dpr, [[fh * 0.3, 0.9]]);
  const s = sprite(out, w, h);
  s.baseY = top + fh; // flame base inside sprite
  return s;
}

export class Krathongs {
  constructor(app) {
    this.app = app;
    this.together = false;
    this.tT = 0;
    this.aura = 0;
    this.heartT = 0;
    this.items = [
      { id: 'her', side: -1, scheme: SCHEMES.her, ph: 0.4 },
      { id: 'his', side: 1, scheme: SCHEMES.his, ph: 2.3 },
    ].map((k) => ({
      ...k,
      x: 0,
      y: 0,
      bob: 0,
      tilt: 0,
      vx: 0,
      scale: 1,
      fl: 1,
      flN: 0.5,
      poke: 0,
      trailT: 0,
      ripT: rand(0.3, 1.2),
      smokeT: rand(0.2, 0.6),
      sparkT: rand(0.3, 0.8),
      init: false,
    }));
  }

  get her() {
    return this.items[0];
  }
  get his() {
    return this.items[1];
  }

  layout() {
    const { W, Wk, dpr, waterY, names } = this.app;
    const p = clamp(Wk / 76, 1.4, 2.6);
    for (const k of this.items) {
      k.body = buildKrathongBody(k.scheme, Wk, dpr, { cols: 34, incenseSide: k.side });
      const handle = '@' + (k.id === 'her' ? names.her : names.him);
      k.label = pixelTextSprite(handle, p, k.scheme.core, k.scheme.neon, dpr);
      k.label.p = p;
      k.label.textW = k.label.w - (p * 6 + 6) * 2;
      k.homeX = W / 2 + k.side * Math.min(W * 0.22, Wk * 1.25);
      if (!k.init) {
        k.x = k.homeX;
        k.y = waterY;
        k.init = true;
      } else {
        k.x = clamp(k.x, 0, W);
        k.y = waterY;
      }
    }
    this.flame = buildFlame(Wk * 0.13, dpr);
  }

  setTogether() {
    if (!this.together) {
      this.together = true;
      this.tT = 0;
    }
  }

  /** Local sprite point → world. */
  toWorld(k, lx, ly) {
    const c = Math.cos(k.tilt) * k.scale;
    const s = Math.sin(k.tilt) * k.scale;
    return [k.x + lx * c - ly * s, k.y + k.bob + lx * s + ly * c];
  }

  flameWorld(k) {
    const B = k.body;
    return this.toWorld(k, 0, B.candleY - B.anchorY - this.flame.h * 0.22);
  }

  update(dt, t) {
    const { W, Wk, waterY, water, fxMid, fxTop, S } = this.app;
    if (this.together) {
      this.tT += dt;
      this.aura = Math.min(1, this.aura + dt * 0.55);
    } else this.aura = Math.max(0, this.aura - dt);
    const gap = Wk * 1.02;

    for (const k of this.items) {
      let tx;
      let ty;
      if (this.together) {
        const T = this.tT;
        tx = W / 2 + (k.side * gap) / 2 + Math.sin(T * 0.75) * Wk * 0.08 + k.side * Math.sin(T * 1.5) * 2.5;
        ty = waterY + Math.sin(T * 0.9) * 4;
      } else {
        tx = k.homeX + Math.sin(t * 0.11 + k.ph) * W * 0.04 + Math.sin(t * 0.29 + k.ph * 2) * W * 0.01;
        ty = waterY + Math.sin(t * 0.13 + k.ph) * 5;
      }
      const px = k.x;
      k.x = damp(k.x, tx, this.together ? 1.25 : 0.9, dt);
      k.y = damp(k.y, ty, 1.5, dt);
      k.vx = (k.x - px) / Math.max(dt, 1e-3);

      const sx = this.together ? W / 2 : k.x;
      const ph = this.together ? 0 : k.ph;
      const h = Math.sin(sx * 0.018 + t * 1.15 + ph) * 0.6 + Math.sin(sx * 0.031 - t * 0.8 + 1.7 + ph) * 0.4;
      const dh = Math.cos(sx * 0.018 + t * 1.15 + ph) * 0.6 * 0.018 + Math.cos(sx * 0.031 - t * 0.8 + 1.7 + ph) * 0.4 * 0.031;
      k.bob = h * 3.6;
      let tilt = dh * 3.6 * 7 + Math.sin(t * 1.3 + ph) * 0.035 - k.vx * 0.0015;
      if (this.together) tilt += -k.side * 0.045 * Math.sin(this.tT * 1.5);
      k.tilt = damp(k.tilt, clamp(tilt, -0.22, 0.22), 5, dt);
      k.scale = water.persp(k.y);
      k.flN = clamp(0.5 + 0.5 * Math.sin(t * 11 + k.ph) * Math.sin(t * 7.3 + k.ph * 3) + (Math.random() - 0.5) * 0.18, 0, 1);
      k.fl = 0.82 + 0.18 * k.flN;
      k.poke = Math.max(0, k.poke - dt * 1.5);

      // stardust trail on the water
      k.trailT -= dt;
      if (k.trailT <= 0) {
        k.trailT = 0.07 / Math.max(0.4, this.app.q);
        const p = fxMid.spawn();
        if (p) {
          const col = pick(k.scheme.trail);
          p.x = k.x + rand(-0.42, 0.42) * Wk;
          p.y = k.y + k.bob + rand(-2, 6);
          p.vx = -k.vx * 0.12 + rand(-5, 5);
          p.vy = rand(-4, 1.5);
          p.drag = 0.9;
          p.life = p.max = rand(1.8, 3.2);
          p.spr = S.glow[col];
          p.size = rand(5, 9);
          p.size1 = 1;
          p.alpha = 0.85;
          p.flick = 0.5;
          if (Math.random() < 0.45) {
            p.gly = S.gly[pick(['dot', 'star4o', 'star4'])][col];
            p.gs = rand(0.3, 0.52);
            p.gs1 = 0.1;
          }
        }
      }
      // gentle ripples from the hull
      k.ripT -= dt;
      if (k.ripT <= 0) {
        k.ripT = rand(1.1, 1.8);
        water.addRipple(k.x + rand(-6, 6), k.y + k.bob + 4, k.scheme.tint, 0.32, 0.75);
      }
      // incense smoke
      k.smokeT -= dt;
      if (k.smokeT <= 0 && k.body.tips.length) {
        k.smokeT = rand(0.25, 0.5);
        const tip = pick(k.body.tips);
        const [wx, wy] = this.toWorld(k, tip.x - k.body.w / 2, tip.y - k.body.anchorY);
        const p = fxMid.spawn();
        if (p) {
          p.x = wx;
          p.y = wy - 2;
          p.vx = rand(-2, 5);
          p.vy = rand(-24, -15);
          p.g = -2;
          p.drag = 0.35;
          p.flutter = 12;
          p.fq = rand(1, 2.5);
          p.life = p.max = rand(2.2, 3.2);
          p.gly = S.gly.wave[pick(['lavender', 'ice', 'sakura'])];
          p.gs = 0.3;
          p.gs1 = 0.85;
          p.alpha = 0.3;
          p.fadeIn = 0.4;
          p.rot = rand(-0.4, 0.4);
        }
      }
      // sparkles running along the incense
      k.sparkT -= dt;
      if (k.sparkT <= 0 && k.body.tips.length) {
        k.sparkT = rand(0.25, 0.6);
        const tip = pick(k.body.tips);
        const f = Math.random() * 0.6;
        const lx = lerp(tip.x - k.body.w / 2, k.side * 0.08 * Wk, f);
        const ly = lerp(tip.y, k.body.m + 0.46 * Wk, f) - k.body.anchorY;
        const [wx, wy] = this.toWorld(k, lx, ly);
        fxTop.sparkle(wx, wy, 1, ['gold', 'cream', 'white'], 14, { g: -6, life: [0.4, 0.8], glyphChance: 1, glyphs: ['star4'], scale: 0.7 });
      }
    }

    if (this.together) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.34;
        const [hx, hy] = this.apexPoint();
        fxTop.hearts(hx, hy, 1, ['pink', 'cyan', 'lavender', 'rose', 'white'], 10);
      }
    }
  }

  apexPoint() {
    const a = this.flameWorld(this.her);
    const b = this.flameWorld(this.his);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - this.app.Wk * 0.42];
  }

  hitTest(x, y) {
    let best = null;
    let bd = Infinity;
    for (const k of this.items) {
      const B = k.body;
      const dx = x - k.x;
      const dy = y - (k.y + k.bob);
      const topY = -(B.anchorY - B.m) * k.scale - 34;
      if (Math.abs(dx) < B.Wk * 0.58 * k.scale && dy > topY && dy < B.Wk * 0.2) {
        const d = Math.abs(dx);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
    return best;
  }

  poke(k) {
    k.poke = 1;
    const [fx, fy] = this.flameWorld(k);
    this.app.fxTop.hearts(fx, fy - 6, Math.round(9 * Math.max(0.6, this.app.q)), k.scheme.hearts, 16);
    this.app.fxTop.sparkle(fx, fy, 16, k.scheme.trail, 70, { g: 10 });
    this.app.water.addRipple(k.x, k.y + 4, k.scheme.tint, 1, 1.2);
  }

  addLights(water) {
    const { S } = this.app;
    for (const k of this.items) {
      const B = k.body;
      const wl = k.y + k.bob;
      water.addLight(k.x, wl + B.Wk * 0.12, B.Wk * 0.8, B.Wk * 0.42, 0.42 * k.fl, S.soft[k.scheme.tint]);
      const fy = wl + 0.62 * (B.anchorY - B.candleY) * k.scale;
      water.addLight(k.x, fy, B.Wk * 0.16 + 10, B.Wk * 0.3, 0.5 * k.fl, S.soft.gold);
    }
    if (this.aura > 0.05) {
      const [hx] = this.apexPoint();
      water.addLight(hx, this.her.y + this.app.Wk * 0.5, this.app.Wk * 1.4, this.app.Wk * 0.7, 0.35 * this.aura, S.soft.lavender);
    }
  }

  /** Mirrored, wobbling reflections (drawn beneath the water glyph layer). */
  drawReflections(ctx, t) {
    const { dpr, S } = this.app;
    ctx.globalCompositeOperation = 'lighter';
    for (const k of this.items) {
      const B = k.body;
      const s = k.scale;
      const wl = k.y + k.bob;
      const slices = 9;
      const sh = B.anchorY / slices;
      const sdpr = B.canvas.width / B.w;
      for (let i = 0; i < slices; i++) {
        const off = Math.sin(t * 2.2 + i * 0.9 + k.ph) * (1 + i * 0.4);
        ctx.globalAlpha = 0.34 * (1 - i / slices);
        ctx.setTransform(s * dpr, 0, 0, -0.62 * s * dpr, (k.x + off) * dpr, wl * dpr);
        const sy = B.anchorY - (i + 1) * sh;
        ctx.drawImage(B.canvas, 0, sy * sdpr, B.canvas.width, sh * sdpr + 1, -B.w / 2, sy - B.anchorY, B.w, sh + 0.5);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fy = wl + 0.62 * (B.anchorY - B.candleY) * s;
      ctx.globalAlpha = 0.5 * k.fl;
      drawSpriteSize(ctx, S.soft.gold, k.x + Math.sin(t * 2.4 + k.ph) * 2, fy, B.Wk * 0.16, B.Wk * 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawAura(ctx, t) {
    const A = this.aura;
    if (A < 0.01) return;
    const { S, Wk } = this.app;
    const a = this.her;
    const b = this.his;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 + (a.bob + b.bob) / 2 - Wk * 0.36;
    const beat = 1 + 0.06 * Math.pow(Math.max(0, Math.sin(t * 2.7)), 16) + 0.04 * Math.pow(Math.max(0, Math.sin(t * 2.7 - 0.55)), 16);
    const sc = Wk * 0.98 * beat * (0.8 + 0.2 * A);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 * A;
    drawSpriteSize(ctx, S.soft.lavender, cx, cy, sc * 2.4, sc * 2.1);
    ctx.globalAlpha = 0.22 * A;
    drawSpriteSize(ctx, S.soft.pink, cx - sc * 0.45, cy - sc * 0.15, sc * 1.2, sc * 1.2);
    drawSpriteSize(ctx, S.soft.cyan, cx + sc * 0.45, cy - sc * 0.15, sc * 1.2, sc * 1.2);

    // neon outline: pink half meets cyan half
    const N = 72;
    const pts = this._heartPts || (this._heartPts = new Float32Array((N + 1) * 2));
    for (let i = 0; i <= N; i++) {
      const [hx, hy] = heartXY((i / N) * TAU);
      pts[i * 2] = cx + hx * sc;
      pts[i * 2 + 1] = cy + hy * sc;
    }
    if (!this._heartGrad || this._heartGradX !== Math.round(cx) || this._heartGradW !== Math.round(sc)) {
      const gr = ctx.createLinearGradient(cx - sc, 0, cx + sc, 0);
      gr.addColorStop(0, 'rgba(255,92,175,1)');
      gr.addColorStop(0.45, 'rgba(205,160,255,1)');
      gr.addColorStop(0.55, 'rgba(205,160,255,1)');
      gr.addColorStop(1, 'rgba(70,225,255,1)');
      this._heartGrad = gr;
      this._heartGradX = Math.round(cx);
      this._heartGradW = Math.round(sc);
    }
    ctx.beginPath();
    for (let i = 0; i <= N; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i * 2], pts[i * 2 + 1]);
    ctx.strokeStyle = this._heartGrad;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.18 * A;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.globalAlpha = 0.32 * A;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.globalAlpha = 0.85 * A;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // travelling sparkles + pixel hearts along the outline
    for (let i = 0; i < N; i += 2) {
      const th = (i / N) * TAU;
      const px = pts[i * 2];
      const py = pts[i * 2 + 1];
      const hx = px - cx;
      const col = hx < -sc * 0.1 ? 'pink' : hx > sc * 0.1 ? 'cyan' : 'lavender';
      const flow = Math.pow(0.5 + 0.5 * Math.sin(th * 3 - t * 3.4), 3);
      ctx.globalAlpha = A * (0.25 + 0.75 * flow);
      const gs = 7 + 12 * flow;
      drawSpriteSize(ctx, S.glow[col], px, py, gs, gs);
      if (i % 6 === 0) drawSprite(ctx, S.pxHeart[col], px, py, 0.4 + 0.25 * flow);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  draw(ctx, t) {
    const { S, dpr } = this.app;
    const F = this.flame;
    for (const k of this.items) {
      const B = k.body;
      const s = k.scale * (1 + 0.05 * k.poke * Math.sin(k.poke * 18));
      const cx = k.x;
      const cy = k.y + k.bob;
      // warm under-glow
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42 * k.fl;
      drawSpriteSize(ctx, S.soft[k.scheme.tint], cx, cy - B.Wk * 0.22, B.Wk * 1.9, B.Wk * 1.15);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const c = Math.cos(k.tilt) * s;
      const sn = Math.sin(k.tilt) * s;
      ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, cx * dpr, cy * dpr);
      ctx.drawImage(B.canvas, -B.w / 2, -B.anchorY, B.w, B.h);
      // candle flame
      const fy = B.candleY - B.anchorY;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * k.fl;
      drawSpriteSize(ctx, S.soft.peach, 0, fy - F.h * 0.3, B.Wk * 0.95, B.Wk * 0.95);
      ctx.globalAlpha = 0.9 * k.fl;
      const gsz = F.h * 1.9 * k.fl;
      drawSpriteSize(ctx, S.glow.gold, 0, fy - F.h * 0.28, gsz, gsz);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const fsy = 0.88 + 0.24 * k.flN;
      const fsx = 1 - 0.08 * k.flN;
      const sway = Math.sin(t * 7 + k.ph) * 0.8;
      ctx.drawImage(F.img, -(F.w * fsx) / 2 + sway, fy - F.baseY * fsy + 1, F.w * fsx, F.h * fsy);
      // glowing incense tips
      ctx.globalCompositeOperation = 'lighter';
      B.tips.forEach((tip, i) => {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7 + k.ph);
        drawSpriteSize(ctx, S.glow.ember, tip.x - B.w / 2, tip.y - B.anchorY, 10, 10);
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    this.drawConnection(ctx, t);
    for (const k of this.items) this.drawLabel(ctx, k, t);
  }

  drawConnection(ctx, t) {
    const A = this.aura;
    if (A < 0.02) return;
    const { S } = this.app;
    const [ax, ay] = this.flameWorld(this.her);
    const [bx, by] = this.flameWorld(this.his);
    const [mx, my] = this.apexPoint();
    const qx = 2 * mx - (ax + bx) / 2;
    const qy = 2 * my - (ay + by) / 2;
    ctx.globalCompositeOperation = 'lighter';
    const N = 20;
    for (let i = 0; i < N; i++) {
      const s = (i / N + t * 0.22) % 1;
      const u = 1 - s;
      const x = u * u * ax + 2 * u * s * qx + s * s * bx;
      const y = u * u * ay + 2 * u * s * qy + s * s * by;
      const col = s < 0.4 ? 'pink' : s > 0.6 ? 'cyan' : 'lavender';
      ctx.globalAlpha = A * Math.sin(Math.PI * s) * 0.95;
      drawSpriteSize(ctx, S.glow[col], x, y, 11, 11);
    }
    const beat = 1 + 0.25 * Math.pow(Math.max(0, Math.sin(t * 2.7)), 12);
    ctx.globalAlpha = A;
    drawSpriteSize(ctx, S.soft.pink, mx, my, 46 * beat, 46 * beat);
    drawSprite(ctx, S.pxHeart.pink, mx, my, 1.05 * beat);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawLabel(ctx, k, t) {
    const { S, dpr } = this.app;
    const L = k.label;
    const B = k.body;
    const p = L.p;
    const stagger = this.together ? k.side * 7 * this.aura : 0;
    const bodyTop = k.y + k.bob - (B.anchorY - B.m) * k.scale;
    const lx = k.x;
    const ly = bodyTop - B.Wk * 0.1 - 6 - 4.5 * p + Math.sin(t * 1.3 + k.ph) * 2.5 + stagger;
    const pulse = 1 + 0.12 * k.poke;

    const n = k.id === 'her' ? 4 : 3;
    const rx = L.textW * 0.56 + 8;
    const ry = 9 * p * 0.95;
    const orbit = (front) => {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const th = t * (k.id === 'her' ? 1.15 : -0.95) + (i * TAU) / n;
        const depth = Math.sin(th);
        if (front !== depth > 0) continue;
        const x = lx + Math.cos(th) * rx;
        const y = ly + depth * ry;
        const sc = 0.62 + 0.2 * depth;
        ctx.globalAlpha = 0.55 + 0.4 * (depth + 1) * 0.5;
        if (k.id === 'her') drawSprite(ctx, S.pxHeart[['pink', 'rose', 'magenta', 'white'][i % 4]], x, y, sc);
        else drawSprite(ctx, S.pxStar[['cyan', 'lavender', 'white'][i % 3]], x, y, sc * 0.95);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    orbit(false);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28;
    drawSpriteSize(ctx, S.soft[k.scheme.tint], lx, ly, L.textW * 1.3, 9 * p * 3);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawSprite(ctx, L, lx, ly, pulse);
    orbit(true);

    if (k.id === 'her') {
      // tiny crown resting on the "@"
      const cx = lx - (L.textW * pulse) / 2 + 3.5 * p;
      const cy = ly - 4.5 * p * pulse - 2.2 * p + Math.sin(t * 2.1) * 1.2;
      const rot = -0.32 + Math.sin(t * 1.7) * 0.06;
      const sc = (p / 2) * 0.95;
      const c = Math.cos(rot) * sc;
      const sn = Math.sin(rot) * sc;
      ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, cx * dpr, cy * dpr);
      const cr = S.crown;
      ctx.drawImage(cr.img, cr.sx, cr.sy, cr.sw, cr.sh, -cr.w / 2, -cr.h / 2, cr.w, cr.h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      const sx = lx + (L.textW * pulse) / 2 + 4 * p;
      const sy = ly - 4.5 * p;
      const tw = 0.75 + 0.25 * Math.sin(t * 3.1);
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, S.pxStar.cyan, sx, sy, (p / 1.6) * 0.8 * tw);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
