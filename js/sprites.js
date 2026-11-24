// Pre-rendered sprites: everything that glows is drawn once (with real blur)
// into a texture atlas at device resolution, then stamped with drawImage each
// frame. No shadowBlur ever runs inside the animation loop.

import { makeCanvas, hexToRgb } from './util.js';

export const MONO =
  '"SF Mono", Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", "Courier New", "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", monospace';

export const HEART = '♥︎';

export const COLORS = {
  pink: '#ff6fb5',
  rose: '#ff9bb8',
  magenta: '#ff3fa4',
  sakura: '#ffc6e0',
  gold: '#ffd36e',
  amber: '#ffab4a',
  ember: '#ff7a45',
  cream: '#fff1c9',
  cyan: '#5ff3ff',
  blue: '#6d8bff',
  lavender: '#c3a6ff',
  ice: '#cfe3ff',
  white: '#fff7fb',
  mint: '#8affd1',
  peach: '#ffc3a0',
};

export const sprite = (img, w, h) => ({ img, sx: 0, sy: 0, sw: img.width, sh: img.height, w, h });

/** Draw a sprite centered at (x, y), scaled. */
export function drawSprite(ctx, s, x, y, scale = 1) {
  const w = s.w * scale;
  const h = s.h * scale;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - w * 0.5, y - h * 0.5, w, h);
}

/** Draw a sprite centered at (x, y) stretched to w×h. */
export function drawSpriteSize(ctx, s, x, y, w, h) {
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - w * 0.5, y - h * 0.5, w, h);
}

/** Shelf-packed texture atlas. Sizes are given in CSS px, stored at device px. */
export class Atlas {
  constructor(dpr, pageSize = 2048) {
    this.dpr = dpr;
    this.pageSize = pageSize;
    this.pages = [];
    this._newPage();
  }

  _newPage() {
    const c = makeCanvas(this.pageSize, this.pageSize);
    this.pages.push(c);
    this.cur = c;
    this.g = c.getContext('2d');
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
  }

  add(w, h, draw) {
    const dpr = this.dpr;
    const pad = 2;
    const iw = Math.ceil(w * dpr);
    const ih = Math.ceil(h * dpr);
    const pw = iw + pad * 2;
    const ph = ih + pad * 2;
    if (pw > this.pageSize || ph > this.pageSize) {
      const c = makeCanvas(iw, ih);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      draw(g, w, h);
      return sprite(c, w, h);
    }
    if (this.x + pw > this.pageSize) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    if (this.y + ph > this.pageSize) this._newPage();
    const g = this.g;
    const ox = this.x + pad;
    const oy = this.y + pad;
    g.save();
    g.beginPath();
    g.rect(ox, oy, iw, ih);
    g.clip();
    g.translate(ox, oy);
    g.scale(dpr, dpr);
    draw(g, w, h);
    g.restore();
    this.x += pw;
    this.rowH = Math.max(this.rowH, ph);
    return { img: this.cur, sx: ox, sy: oy, sw: iw, sh: ih, w, h };
  }
}

/**
 * Add a blurred neon halo behind an existing canvas (device-px canvas).
 * Uses the off-canvas shadow trick so only the blur lands, then the crisp
 * source is drawn on top. passes: [[blurCssPx, alpha], ...]
 */
export function glowify(src, color, dpr, passes = [[10, 0.7], [3, 0.9]]) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  const off = src.width + 64;
  const [r, gg, b] = hexToRgb(color);
  g.shadowOffsetX = off;
  g.shadowOffsetY = 0;
  for (const [blur, alpha] of passes) {
    g.shadowColor = `rgba(${r},${gg},${b},${alpha})`;
    g.shadowBlur = blur * dpr;
    g.drawImage(src, -off, 0);
  }
  g.shadowColor = 'rgba(0,0,0,0)';
  g.shadowBlur = 0;
  g.shadowOffsetX = 0;
  g.drawImage(src, 0, 0);
  return c;
}

/** Hot-core bloom dot (for particles, flames, stars). */
export function glowSprite(atlas, hex, size = 48) {
  const [r, g, b] = hexToRgb(hex);
  const wr = Math.round(r + (255 - r) * 0.7);
  const wg = Math.round(g + (255 - g) * 0.7);
  const wb = Math.round(b + (255 - b) * 0.7);
  return atlas.add(size, size, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, `rgba(${wr},${wg},${wb},1)`);
    grd.addColorStop(0.1, `rgba(${r},${g},${b},0.92)`);
    grd.addColorStop(0.3, `rgba(${r},${g},${b},0.36)`);
    grd.addColorStop(0.6, `rgba(${r},${g},${b},0.09)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Soft, core-less light (for tints, auras, reflections). */
export function softSprite(atlas, hex, size = 64) {
  const [r, g, b] = hexToRgb(hex);
  return atlas.add(size, size, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},0.6)`);
    grd.addColorStop(0.7, `rgba(${r},${g},${b},0.16)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A single ASCII/Unicode glyph with a soft neon glow. */
export function glyphSprite(atlas, ch, px, hex, glow = 0.32) {
  const pad = Math.ceil(px * glow * 1.25) + 2;
  const w = px * 1.2 + pad * 2;
  const h = px * 1.3 + pad * 2;
  return atlas.add(w, h, (g, W, H) => {
    g.font = `600 ${px}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = hex;
    if (glow > 0) {
      g.shadowColor = hex;
      g.shadowBlur = px * glow * atlas.dpr;
      g.fillText(ch, W / 2, H / 2);
      g.shadowBlur = 0;
    }
    g.fillText(ch, W / 2, H / 2);
  });
}

// ---------------------------------------------------------------------------
// Pixel art & a tiny 5×9 bitmap font (ascender rows 0-1, x-height 2-6,
// descenders 7-8) so the usernames are razor-crisp neon pixels on any screen.

const RAW_FONT = {
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#....', '.###.'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  i: ['.#.', '...', '##.', '.#.', '.#.', '.#.', '###'],
  j: ['..#', '...', '.##', '..#', '..#', '..#', '..#', '#.#', '.#.'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
  l: ['##.', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#..', '.#..', '####', '.#..', '.#..', '.#.#', '..#.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  _: ['....', '....', '....', '....', '....', '....', '....', '####'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  ' ': ['...'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
};

export const PIXEL_FONT = {};
for (const [ch, rows] of Object.entries(RAW_FONT)) {
  const w = Math.max(...rows.map((r) => r.length));
  const full = [];
  for (let i = 0; i < 9; i++) full.push((rows[i] || '').padEnd(w, '.'));
  PIXEL_FONT[ch] = { w, rows: full };
}

export const PX_HEART = ['.##.##.', '#w#####', '#######', '.#####.', '..###..', '...#...'];
export const PX_CROWN = ['w...o...w', '#...#...#', '##.###.##', '#########', '#o##w##o#', '#########'];
export const PX_STAR = ['...#...', '...#...', '..###..', '###w###', '..###..', '...#...', '...#...'];

/** Keep only characters the pixel font can draw. */
export function sanitizeHandle(s, fallback) {
  const clean = String(s || '')
    .toLowerCase()
    .split('')
    .filter((ch) => PIXEL_FONT[ch])
    .join('')
    .slice(0, 22);
  return clean || fallback;
}

/** Neon pixel-font text sprite (standalone canvas, device resolution). */
export function pixelTextSprite(text, p, core, neon, dpr) {
  const glyphs = text.toLowerCase().split('').map((ch) => PIXEL_FONT[ch] || PIXEL_FONT[' ']);
  const units = glyphs.reduce((s, g) => s + g.w, 0) + Math.max(0, glyphs.length - 1);
  const m = Math.ceil(p * 6 + 6);
  const w = units * p + m * 2;
  const h = 9 * p + m * 2;
  const c = makeCanvas(w * dpr, h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = core;
  let ox = m;
  for (const gl of glyphs) {
    for (let r = 0; r < 9; r++) {
      const row = gl.rows[r];
      for (let col = 0; col < gl.w; col++) {
        if (row[col] === '#') g.fillRect(ox + col * p, m + r * p, p * 0.86, p * 0.86);
      }
    }
    ox += (gl.w + 1) * p;
  }
  const out = glowify(c, neon, dpr, [
    [p * 6.5, 0.8],
    [p * 2.2, 1],
  ]);
  return sprite(out, w, h);
}

/** Pixel art (rows of chars → palette colors) into the atlas, with glow. */
export function pixelArtSprite(atlas, rows, palette, p, glowHex) {
  const cols = rows[0].length;
  const m = p * 3 + 3;
  const w = cols * p + m * 2;
  const h = rows.length * p + m * 2;
  return atlas.add(w, h, (g) => {
    const paint = () => {
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < cols; c++) {
          const key = rows[r][c];
          if (key === '.' || !palette[key]) continue;
          g.fillStyle = palette[key];
          g.fillRect(m + c * p, m + r * p, p * 0.9, p * 0.9);
        }
      }
    };
    g.shadowColor = glowHex;
    g.shadowBlur = p * 2.6 * atlas.dpr;
    paint();
    g.shadowBlur = 0;
    paint();
  });
}

/** Build the shared sprite library for the current device pixel ratio. */
export function buildLibrary(dpr) {
  const atlas = new Atlas(dpr, 2048);
  const S = { atlas, glow: {}, soft: {}, gly: {}, pxHeart: {}, pxStar: {}, crown: null };
  for (const [name, hex] of Object.entries(COLORS)) {
    S.glow[name] = glowSprite(atlas, hex, 48);
    S.soft[name] = softSprite(atlas, hex, 64);
  }
  const glyphs = {
    star4: '✦',
    star4o: '✧',
    ast: '*',
    plus: '+',
    dot: '·',
    heart: HEART,
    flower: '✿',
    flower2: '❀',
    wave: '~',
    bullet: '•',
  };
  for (const [key, ch] of Object.entries(glyphs)) {
    S.gly[key] = {};
    for (const [name, hex] of Object.entries(COLORS)) S.gly[key][name] = glyphSprite(atlas, ch, 18, hex);
  }
  for (const name of ['pink', 'rose', 'magenta', 'white', 'cyan', 'lavender', 'sakura', 'gold', 'blue']) {
    S.pxHeart[name] = pixelArtSprite(atlas, PX_HEART, { '#': COLORS[name], w: '#ffffff' }, 2, COLORS[name]);
    S.pxStar[name] = pixelArtSprite(atlas, PX_STAR, { '#': COLORS[name], w: '#ffffff' }, 1.6, COLORS[name]);
  }
  S.crown = pixelArtSprite(atlas, PX_CROWN, { '#': '#ffd36e', o: '#ff5fae', w: '#fffaf0' }, 2, '#ffc35a');
  return S;
}
