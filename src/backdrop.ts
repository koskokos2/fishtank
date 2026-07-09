// Procedural static backdrop, baked once into a single BW x BH sprite. Generated
// as a raw RGBA buffer (headlessly previewable), then painted to an offscreen
// canvas for kaplay. A warm tropical reef: a smooth water gradient over warm
// gold sand.
// Organic ordered dithering gives the solid materials pixel texture without
// filling the water with a high-resolution dot mesh.
//
// Authored in 640x360 design space and scaled by RES: macro features (props,
// sand height) multiply by S so the composition is unchanged. Broad
// water gradients stay smooth at high RES; harder materials keep a broken-up
// ordered dither for pixel texture.

import { type RGBA, lerp, clamp01 } from "./color";
import { RES } from "./res";

const S = RES;
export const BW = 640 * S;
export const BH = 360 * S;
const SAND_H = 58 * S; // sand floor height from the bottom
const LEFT_DUNE_START_U = 0.4;
const LEFT_DUNE_HEIGHT = BH * 0.4;

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

function orderedGrain(x: number, y: number) {
  const tx = Math.floor(x / 8);
  const ty = Math.floor(y / 8);
  const mode = Math.floor(hash2(tx, ty, 91) * 8);
  let lx = x & 7;
  let ly = y & 7;

  // Keep the useful local Bayer distribution, but vary orientation per tile so
  // the high-resolution backdrop does not expose one endless 8x8 lattice.
  if (mode & 1) lx = 7 - lx;
  if (mode & 2) ly = 7 - ly;
  if (mode & 4) [lx, ly] = [ly, lx];

  const ordered = (BAYER8[ly][lx] + 0.5) / 64;
  const pixel = hash2(x, y, 93) - 0.5;
  const tile = hash2(tx, ty, 95) - 0.5;
  return clamp01(ordered + pixel * 0.22 + tile * 0.08);
}

// Pick between two colors by an ordered threshold — the core of every gradient.
const dither = (c0: RGBA, c1: RGBA, t: number, x: number, y: number): RGBA =>
  t > orderedGrain(x, y) ? c1 : c0;

// Dither across an ordered ramp of >=2 stops by t in [0,1].
function ditherRamp(stops: RGBA[], t: number, x: number, y: number): RGBA {
  const f = clamp01(t) * (stops.length - 1);
  const i0 = Math.min(stops.length - 1, Math.floor(f));
  const i1 = Math.min(stops.length - 1, i0 + 1);
  return dither(stops[i0], stops[i1], f - i0, x, y);
}

function mixColor(c0: RGBA, c1: RGBA, t: number): RGBA {
  return [
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
    Math.round(lerp(c0[3], c1[3], t)),
  ];
}

function smoothRamp(stops: RGBA[], t: number): RGBA {
  const f = clamp01(t) * (stops.length - 1);
  const i0 = Math.min(stops.length - 1, Math.floor(f));
  const i1 = Math.min(stops.length - 1, i0 + 1);
  return mixColor(stops[i0], stops[i1], f - i0);
}

// --- warm palette ------------------------------------------------------------

// Water, top (aqua) -> bottom (deep warm navy). The ramp is weighted deep so the
// mid swimming zone is dark enough for fish to pop.
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
// --- buffer helpers ----------------------------------------------------------

type Buf = RGBA[];
const setPx = (buf: Buf, x: number, y: number, c: RGBA) => {
  if (x >= 0 && x < BW && y >= 0 && y < BH) buf[(y | 0) * BW + (x | 0)] = c;
};

// The sand surface height (buffer y) at column x — the dune contour. Exported so
// benthic creatures (the octopus) can rest on the ground instead of floating.
export const sandTopAt = (x: number) => {
  const u = x / Math.max(1, BW - 1);
  const slope = lerp(-13 * S, 11 * S, u);
  const swell =
    Math.sin(u * Math.PI * 2 - 0.6) * 8 * S +
    Math.sin(u * Math.PI * 4 + 1.2) * 4 * S;
  const g0 = (u - 0.18) / 0.12;
  const g1 = (u - 0.62) / 0.16;
  const g2 = (u - 0.9) / 0.1;
  const mound =
    -Math.exp(-(g0 * g0)) * 9 * S +
    Math.exp(-(g1 * g1)) * 7 * S -
    Math.exp(-(g2 * g2)) * 6 * S;
  const chop = (fbm(x * 0.025, 0, 21) - 0.5) * 6 * S;
  const baseTop = BH - SAND_H + slope + swell + mound + chop;
  if (u >= LEFT_DUNE_START_U) return Math.round(baseTop);

  const rise = fade(clamp01(u / LEFT_DUNE_START_U));
  return Math.round(lerp(BH - LEFT_DUNE_HEIGHT, baseTop, rise));
};

// z from screen depth: whatever sits lower on screen is nearer the viewer, so
// it must draw in front. Grounded objects pass their base (sand-contact line);
// fish pass their own y — they never descend below the crest, so they slip
// behind anything rooted on the dune. The band stays behind the hovering
// swimmers (jellyfish 15, nautilus 16) and in front of the caustics (-95).
export const groundZ = (baseY: number) => -90 + 80 * (baseY / BH);

// The first few pixels below the waterline are slightly darker: loose silt and
// grains slope away from the lit crest instead of forming a flat yellow band.
function sandShadow(y: number, top: number) {
  const d = y - top;
  return Math.max(0, 1 - d / (10 * S)) * 0.08;
}

// --- painters (back to front) ------------------------------------------------

function paintWater(buf: Buf) {
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      // Bias deeper so the bright aqua stays near the surface and the swimming
      // zone is darker (more fish contrast); tiny wobble so stops aren't flat.
      let g = Math.pow(y / (BH - 1), 0.82);
      g += (fbm(x * 0.012, y * 0.02, 11) - 0.5) * 0.03;
      setPx(buf, x, y, smoothRamp(WATER, clamp01(g)));
    }
  }
}

function paintSand(buf: Buf) {
  for (let x = 0; x < BW; x++) {
    const top = sandTopAt(x);
    for (let y = top; y < BH; y++) {
      const depth = (y - top) / Math.max(1, BH - top);
      const rippleY = y / S + fbm(x * 0.006, y * 0.01, 31) * 9;
      const ripple = Math.sin(rippleY * 0.48 + x * 0.012) * 0.5 + 0.5;
      const rippleLine = Math.pow(ripple, 9) * (1 - depth) * 0.13;
      const trough = Math.pow(1 - ripple, 7) * (1 - depth) * 0.06;
      const fine = (hash2(x, y, 7) - 0.5) * 0.08;
      const coarse = (fbm(x * 0.09, y * 0.08, 37, 3) - 0.5) * 0.12;
      const fleck = hash2(Math.floor(x / S), Math.floor(y / S), 43) > 0.985 ? -0.18 : 0;
      let L =
        lerp(0.94, 0.36, depth) +
        rippleLine -
        trough +
        fine +
        coarse +
        fleck -
        sandShadow(y, top);
      setPx(buf, x, y, ditherRamp(SAND, clamp01(L), x, y));
    }
    if (x % (3 * S) < S) setPx(buf, x, top, SAND[2]); // broken sunlit crest
    // Dithered silt fading up into the water.
    for (let y = top - 6 * S; y < top; y++) {
      if ((top - y) / (6 * S) < orderedGrain(x, y)) setPx(buf, x, y, SAND[1]);
    }
  }
}

// --- assembly ----------------------------------------------------------------

export function backdropPixels(seed = 1): RGBA[] {
  const buf: Buf = new Array(BW * BH);
  paintWater(buf);
  paintSand(buf);
  return buf;
}

const CLEAR: RGBA = [0, 0, 0, 0];

// DOM bake -> data URLs for kaplay's loadSprite. The scene splits into two
// full-resolution layers: the opaque water back plate and a transparent
// sand overlay (dunes only). Far plants render between the two so the dune crest
// occludes their roots. Props remain live so the rotating pool can replace them.
export async function makeBackdrop(
  seed = 1,
): Promise<{ back: string; sand: string }> {
  const backBuf: Buf = new Array(BW * BH);
  paintWater(backBuf);

  const sandBuf: Buf = new Array(BW * BH).fill(CLEAR);
  paintSand(sandBuf);
  const sand = bufToCanvas(sandBuf);

  return { back: bufToCanvas(backBuf).toDataURL(), sand: sand.toDataURL() };
}

function bufToCanvas(buf: Buf): HTMLCanvasElement {
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
  return canvas;
}
