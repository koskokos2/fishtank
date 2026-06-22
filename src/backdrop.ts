// Procedural static backdrop, baked once into a single BW x BH sprite. Generated
// as a raw RGBA buffer (headlessly previewable), then painted to an offscreen
// canvas for kaplay. A warm tropical reef: a dithered water gradient, ruined
// columns + a stone arch, and coral, over the warm gold sand. Ordered (Bayer)
// dithering gives the gradients pixel texture instead of flat bands.
//
// Authored in 640x360 design space and scaled by RES: macro features (columns,
// arch, coral, sand height) multiply by S so the composition is unchanged, while
// the noise frequencies and the Bayer/grain patterns are left alone so they get
// finer at higher RES — the denser pixel texture is the whole point.

import { type RGBA, lerp, clamp01 } from "./color";
import { RES } from "./res";

const S = RES;
export const BW = 640 * S;
export const BH = 360 * S;
const SAND_H = 58 * S; // sand floor height from the bottom

// --- deterministic noise + dithering ---------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number) {
  let h =
    Math.imul(ix, 374761393) +
    Math.imul(iy, 668265263) +
    Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

function vnoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fade(fx);
  const v = fade(fy);
  return lerp(
    lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), u),
    lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), u),
    v,
  );
}

function fbm(x: number, y: number, seed: number, oct = 4) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * freq, y * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

const BAYER8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];
const bayer = (x: number, y: number) => BAYER8[y & 7][x & 7] / 64;

// Pick between two colors by an ordered threshold — the core of every gradient.
const dither = (c0: RGBA, c1: RGBA, t: number, x: number, y: number): RGBA =>
  t > bayer(x, y) ? c1 : c0;

// Dither across an ordered ramp of >=2 stops by t in [0,1].
function ditherRamp(stops: RGBA[], t: number, x: number, y: number): RGBA {
  const f = clamp01(t) * (stops.length - 1);
  const i0 = Math.min(stops.length - 1, Math.floor(f));
  const i1 = Math.min(stops.length - 1, i0 + 1);
  return dither(stops[i0], stops[i1], f - i0, x, y);
}

// --- warm palette ------------------------------------------------------------

// Water, top (aqua) -> bottom (deep warm navy). Many closely-spaced stops keep
// the ordered dither low-contrast (fine grain, not a loud checker), and the ramp
// is weighted deep so the mid swimming zone is dark enough for fish to pop.
const WATER: RGBA[] = [
  [96, 178, 190, 255],
  [66, 150, 166, 255],
  [44, 120, 144, 255],
  [30, 96, 124, 255],
  [22, 74, 104, 255],
  [16, 56, 84, 255],
  [12, 42, 68, 255],
  [9, 32, 54, 255],
  [7, 24, 44, 255],
];
const SAND: RGBA[] = [
  [120, 96, 56, 255], // shadow
  [180, 148, 88, 255], // body
  [206, 176, 110, 255], // sunlit
];
const STONE: RGBA[] = [
  [92, 82, 64, 255], // shadow
  [138, 126, 100, 255], // mid
  [184, 172, 144, 255], // lit sandstone
];
const CORAL = {
  dark: [96, 58, 60, 255] as RGBA,
  mid: [168, 104, 80, 255] as RGBA,
  lit: [208, 152, 112, 255] as RGBA,
};
const CORAL_ROSE = {
  dark: [92, 60, 90, 255] as RGBA,
  mid: [150, 100, 130, 255] as RGBA,
  lit: [198, 150, 172, 255] as RGBA,
};

// --- buffer helpers ----------------------------------------------------------

type Buf = RGBA[];
const setPx = (buf: Buf, x: number, y: number, c: RGBA) => {
  if (x >= 0 && x < BW && y >= 0 && y < BH) buf[(y | 0) * BW + (x | 0)] = c;
};

const sandTopAt = (x: number) =>
  BH - SAND_H + Math.round((fbm(x * 0.025, 0, 21) - 0.5) * 12 * S);

// --- painters (back to front) ------------------------------------------------

function paintWater(buf: Buf) {
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      // Bias deeper so the bright aqua stays near the surface and the swimming
      // zone is darker (more fish contrast); tiny wobble so stops aren't flat.
      let g = Math.pow(y / (BH - 1), 0.82);
      g += (fbm(x * 0.012, y * 0.02, 11) - 0.5) * 0.03;
      setPx(buf, x, y, ditherRamp(WATER, clamp01(g), x, y));
    }
  }
}

// A weathered stone block, lit from the top.
function block(buf: Buf, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = (y1 - y) / Math.max(1, y1 - y0); // 1 at top, 0 at bottom
      let L = 0.45 + 0.55 * v;
      L *= 0.9 + 0.1 * fbm(x * 0.15, y * 0.15, 71);
      setPx(buf, x, y, ditherRamp(STONE, clamp01(L), x, y));
    }
  }
}

function column(buf: Buf, cx: number, top: number, hw: number) {
  const bottom = BH; // runs into the sand, which is painted over it later
  for (let y = top; y < bottom; y++) {
    for (let x = cx - hw; x <= cx + hw; x++) {
      const u = (x - (cx - hw)) / (2 * hw); // 0..1 across the shaft
      let L = 0.4 + 0.6 * Math.sin(u * Math.PI); // cylinder roundness
      const flute = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 4); // 4 grooves
      L *= lerp(0.8, 1, flute);
      L *= 0.9 + 0.1 * fbm(x * 0.1, y * 0.12, 73); // weathering
      setPx(buf, x, y, ditherRamp(STONE, clamp01(L), x, y));
    }
  }
  block(buf, cx - hw - 3 * S, top - 5 * S, cx + hw + 3 * S, top - 1 * S); // capital
}

function arch(
  buf: Buf,
  axc: number,
  ayc: number,
  ri: number,
  ro: number,
  missing: Set<number>,
) {
  const NB = 11;
  const step = Math.PI / NB;
  for (let y = ayc - ro - 1; y <= ayc; y++) {
    for (let x = axc - ro - 1; x <= axc + ro + 1; x++) {
      const dx = x - axc;
      const dy = y - ayc;
      const r = Math.hypot(dx, dy);
      if (r < ri || r > ro) continue;
      const ang = Math.atan2(-dy, dx);
      if (ang < 0 || ang > Math.PI) continue;
      const blk = Math.floor(ang / step);
      if (missing.has(blk)) continue;
      if (r > ro - 2 * S && fbm(x * 0.2, y * 0.2, 41) < 0.35) continue; // chipped edge
      const ga = (ang % step) / step;
      const mortar = ga < 0.08 || ga > 0.92;
      const gr = (r - ri) / (ro - ri);
      let L = (0.45 + 0.55 * Math.sin(ang)) * lerp(0.7, 1, gr);
      if (mortar) L *= 0.5;
      setPx(buf, x, y, ditherRamp(STONE, clamp01(L), x, y));
    }
  }
}

function paintRuins(buf: Buf) {
  const cxL = 248 * S;
  const cxR = 392 * S;
  const hw = 9 * S;
  const springline = 158 * S; // where the arch springs from the column tops
  column(buf, cxL, springline, hw);
  column(buf, cxR, 214 * S, hw); // right column broken short, below the springline
  // Arch radius = half the column span, so its springs land on the column tops.
  // Blocks 0-2 (the right-lower spring) are gone — collapsed toward the broken
  // right column — leaving the arch intact over the left.
  arch(buf, (cxL + cxR) / 2, springline, (cxR - cxL) / 2, (cxR - cxL) / 2 + 12 * S, new Set([0, 1, 2]));
}

function disc(buf: Buf, cx: number, cy: number, r: number, col: RGBA) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) setPx(buf, cx + x, cy + y, col);
}

type CoralPal = { dark: RGBA; mid: RGBA; lit: RGBA };

function brainMound(buf: Buf, cx: number, cy: number, R: number, pal: CoralPal) {
  const lobes: [number, number, number][] = [
    [cx, cy, R],
    [cx - R * 0.6, cy + R * 0.2, R * 0.7],
    [cx + R * 0.55, cy + R * 0.18, R * 0.72],
    [cx, cy - R * 0.45, R * 0.62],
  ];
  for (let y = Math.floor(cy - R * 1.6); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R * 1.7); x <= cx + R * 1.7; x++) {
      let h = -1;
      for (const [lx, ly, lr] of lobes) {
        const dd = Math.hypot(x - lx, y - ly) / lr;
        if (dd <= 1) h = Math.max(h, 1 - dd);
      }
      if (h < 0) continue;
      const m = Math.sin(
        fbm(x * 0.18, y * 0.18, 51) * 6.283 + fbm(x * 0.05, y * 0.05, 53) * 9,
      );
      const groove = Math.abs(m) < 0.22;
      const L = (0.45 + 0.55 * h) * (groove ? 0.6 : 1);
      let col = ditherRamp([pal.dark, pal.mid, pal.lit], clamp01(L), x, y);
      if (h < 0.2 && y < cy) col = dither(pal.mid, pal.lit, 0.7, x, y); // rim
      setPx(buf, x, y, col);
    }
  }
}

function branch(
  buf: Buf,
  x: number,
  y: number,
  angle: number,
  len: number,
  th: number,
  depth: number,
  pal: CoralPal,
  rng: () => number,
) {
  if (depth <= 0 || len < 2) return;
  const steps = Math.max(2, Math.round(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx = x + Math.cos(angle) * len * t;
    const by = y + Math.sin(angle) * len * t;
    const w = Math.max(1, Math.round(th * (1 - 0.5 * t)));
    const col = ditherRamp(
      [pal.dark, pal.mid, pal.lit],
      0.4 + 0.4 * t,
      Math.round(bx),
      Math.round(by),
    );
    disc(buf, Math.round(bx), Math.round(by), w, col);
  }
  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len;
  const spread = 0.4 + 0.35 * rng();
  branch(buf, ex, ey, angle - spread, len * 0.72, th * 0.7, depth - 1, pal, rng);
  branch(buf, ex, ey, angle + spread, len * 0.72, th * 0.7, depth - 1, pal, rng);
  if (rng() < 0.3)
    branch(buf, ex, ey, angle + (rng() - 0.5), len * 0.6, th * 0.6, depth - 1, pal, rng);
}

function paintCoral(buf: Buf, rng: () => number) {
  // Brain-coral mounds along the sand and at a column base.
  brainMound(buf, 120 * S, sandTopAt(120 * S) - 6 * S, 22 * S, CORAL);
  brainMound(buf, 470 * S, sandTopAt(470 * S) - 4 * S, 18 * S, CORAL_ROSE);
  brainMound(buf, 545 * S, sandTopAt(545 * S) - 8 * S, 26 * S, CORAL);
  brainMound(buf, 250 * S, sandTopAt(250 * S) - 4 * S, 14 * S, CORAL_ROSE);
  // Branching coral rising from the sand.
  branch(buf, 90 * S, sandTopAt(90 * S), -Math.PI / 2 - 0.1, 16 * S, 3 * S, 5, CORAL_ROSE, rng);
  branch(buf, 580 * S, sandTopAt(580 * S), -Math.PI / 2 + 0.15, 18 * S, 3 * S, 5, CORAL, rng);
  branch(buf, 430 * S, sandTopAt(430 * S), -Math.PI / 2, 14 * S, 2 * S, 4, CORAL, rng);
}

function paintSand(buf: Buf) {
  for (let x = 0; x < BW; x++) {
    const top = sandTopAt(x);
    for (let y = top; y < BH; y++) {
      const depth = (y - top) / Math.max(1, BH - top);
      let L = lerp(1, 0.4, depth) + (hash2(x, y, 7) - 0.5) * 0.1;
      setPx(buf, x, y, ditherRamp(SAND, clamp01(L), x, y));
    }
    setPx(buf, x, top, SAND[2]); // sunlit crest
    // Dithered silt fading up into the water.
    for (let y = top - 6 * S; y < top; y++) {
      if ((top - y) / (6 * S) < bayer(x, y)) setPx(buf, x, y, SAND[1]);
    }
  }
}

// --- assembly ----------------------------------------------------------------

export function backdropPixels(seed = 1): RGBA[] {
  const rng = mulberry32(seed);
  const buf: Buf = new Array(BW * BH);
  paintWater(buf);
  paintRuins(buf);
  paintSand(buf);
  paintCoral(buf, rng);
  return buf;
}

// DOM bake -> data URL for kaplay's loadSprite (mirrors makeFishSheet).
export function makeBackdrop(seed = 1): string {
  const buf = backdropPixels(seed);
  const canvas = document.createElement("canvas");
  canvas.width = BW;
  canvas.height = BH;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(BW, BH);
  for (let i = 0; i < buf.length; i++) {
    const [r, g, b, a] = buf[i];
    const p = i * 4;
    img.data[p] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
