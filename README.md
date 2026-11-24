# ลอยกระทง ♡ Kratong Digital

A romantic, mobile-first interactive Loy Krathong night: an ASCII full moon, Yi Peng sky lanterns,
neon-pastel fireworks and two hero krathongs, **@jvstjahh** and **@_f1rst.suwann**, floating on a
river of glowing ASCII waves. It's built with HTML5 Canvas, CSS3 and plain JavaScript modules.
There's no build step, no framework and no external assets: every sound is synthesized live with
the Web Audio API.

## Features

- **Cinematic sky**: a `#03040c → #0a0f2c → #161238` gradient, a pastel-dot Milky Way, multi-layer
  twinkling ASCII stars (`✦ ✧ * + ·`), shooting stars with glowing tails, and a temple shoreline
  with festival lights.
- **ASCII full moon** made of golden-pearl characters, with lunar maria, a layered bloom halo and a
  shimmering golden reflection path on the water.
- **35+ Yi Peng lanterns** at three parallax depths. Each has an ASCII paper texture, a flickering
  flame core and a warm aura, and is reflected on the river.
- **Living water**: a perspective grid of `~ ≈ - ·` glyphs that light up in real time from the moon,
  lanterns, fireworks, ripples and both krathongs (the glyphs themselves take the colour). Fireflies
  drift above.
- **Two hero krathongs**: procedural ASCII lotus cups with candle, incense, flowers and a crown
  (hers) or star (his). Neon pixel-font usernames with orbiting pixel hearts. The krathongs bob and
  tilt on the swell and leave stardust trails and ripples.
- **Touch magic**:
  - tap the sky to launch multi-stage fireworks (hearts, sakura, golden willow, peony + crackle, rings)
  - tap the water for neon ripples and a mini lotus krathong or lantern
  - swipe anywhere for a fairy-dust trail
  - tap a krathong to send up floating hearts
- **HUD** (glassmorphism):
  - 💖 **ลอยคู่กัน**: both krathongs glide together into the moon path, dance in sync inside a
    glowing pink→cyan heart aura, and trigger a heart-firework finale with shooting stars.
  - 🏮 **ปล่อยโคมอธิษฐาน**: a bottom sheet for typing a wish. A giant lantern carries the text (Thai
    word-wrapped) up to the moon.
  - 🎵 **เพลง**: a lo-fi music-box track (pad, bass, brushed beat, vinyl crackle, reverb) plus
    chimes and sparkles on touch.
  - 👁️ **ซ่อนปุ่ม (Clean View)**: hides every control for clean screen recording. Tap the
    top-right corner to bring them back.

## Performance

- Rendering scales by `devicePixelRatio` (up to 3×), so glyphs stay sharp on Retina and AMOLED screens.
- Every glow is pre-rendered once into a texture atlas. No `shadowBlur` runs per frame.
- Particles come from fixed-size pools with swap-remove, so nothing is allocated in the loop.
- Adaptive quality: if the frame rate drops, the renderer steps down resolution and particle
  budgets automatically. You can force a level with `?q=0` (sharpest) to `?q=5` (lightest).

## URL options

| Param | Example | Effect |
| --- | --- | --- |
| `her` / `him` | `?her=jvstjahh&him=_f1rst.suwann` | Change the two usernames (a–z, 0–9, `_`, `.`, `-`) |
| `clean` | `?clean=1` | Start with Clean View (great for recording) |
| `q` | `?q=0` | Lock a quality level |

Desktop shortcuts: `T` float together · `W` wish · `M` music · `H` hide/show the HUD.

## Run locally

ES modules need a web server, so opening the file directly won't work:

```bash
npx serve .            # or: python3 -m http.server 8080
```

## Deploy

This is a static site, ready for Vercel as-is (`vercel.json` sets caching and security headers):

```bash
npx vercel --prod
```

Or import the GitHub repo at vercel.com/new using **Framework preset: Other** with no build command
and the output directory set to the repo root. After that, every push to `main` redeploys.

## Credits

The Thai typeface is [Mali](https://github.com/cadsondemak/Mali) by Cadson Demak (SIL Open Font
License, see `fonts/OFL-LICENSE.txt`). Everything else (art, music and sound) is generated in code.
