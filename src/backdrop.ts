// Procedural static backdrop, baked once into a single BW x BH sprite. Generated
// as a raw RGBA buffer (headlessly previewable), then painted to an offscreen
// canvas for kaplay. A warm tropical reef: a smooth water gradient, ruined
// columns + a stone arch, and atlas-based coral sprites, over the warm gold sand.
// Organic ordered dithering gives the solid materials pixel texture without
// filling the water with a high-resolution dot mesh.
//
// Authored in 640x360 design space and scaled by RES: macro features (columns,
// arch, coral, sand height) multiply by S so the composition is unchanged. Broad
// water gradients stay smooth at high RES; harder materials keep a broken-up
// ordered dither for pixel texture.

import { type RGBA, lerp, clamp01 } from "./color";
import { RES } from "./res";
import { CORAL_ATLAS, CORAL_ATLAS_CELL, CORAL_ATLAS_LAYOUT } from "./coralsAtlas";

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
const STONE: RGBA[] = [
  [92, 82, 64, 255], // shadow
  [138, 126, 100, 255], // mid
  [184, 172, 144, 255], // lit sandstone
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
  return BH - SAND_H + Math.round(slope + swell + mound + chop);
};

function sandShadow(x: number, y: number, top: number) {
  const d = y - top;
  let shade = 0;
  const add = (cx: number, cy: number, rx: number, ry: number, strength: number) => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const falloff = 1 - (nx * nx + ny * ny);
    if (falloff > 0) shade += falloff * strength;
  };

  // Contact shadows under the ruins columns.
  add(248 * S, top + 2 * S, 18 * S, 8 * S, 0.18);
  add(392 * S, top + 2 * S, 16 * S, 7 * S, 0.14);

  // The first few pixels below the waterline are slightly darker: loose silt and
  // grains slope away from the lit crest instead of forming a flat yellow band.
  shade += Math.max(0, 1 - d / (10 * S)) * 0.08;
  return shade;
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

// --- coral placement ---------------------------------------------------------

// Each entry positions one atlas cell in the backdrop buffer. x,y are the
// top-left corner of the 128px cell in buffer space.
export type CoralBlit = { name: string; x: number; y: number };

// Place one coral so its main body rests on the sand at design-space x = cx.
// yShift (design px) nudges it down into the sand (positive = closer/foreground,
// foot buried a touch) or up (negative = further back, just kissing the sand).
// Uses the tight bottom offset baked into CORAL_ATLAS_LAYOUT — which now tracks
// the coral's real base, ignoring stray atlas-edge pixels — so nothing floats.
function place(cx: number, yShift: number, name: string): CoralBlit {
  const { bottom } = CORAL_ATLAS_LAYOUT[name];
  const bx = Math.round(cx * S) - CORAL_ATLAS_CELL / 2;
  const floor = sandTopAt(cx * S) + Math.round(yShift * S);
  return { name, x: bx, y: floor - bottom - 1 };
}

// A varied scatter of standalone corals across the floor. Rather than a single
// row hugging the crest, the corals are spread through the sand's full depth in
// three tiers — a back row kissing the crest, a mid row, and a foreground row
// sunk well into the bed — so the tall sand band reads as a populated seabed
// with depth. yShift (design px below the crest) sets each coral's tier; bigger
// = lower/nearer. Listed back-to-front so foreground corals overlap on top. The
// cx values keep clear of the ruin columns (design x ~248 / ~392).
export function coralBlits(): CoralBlit[] {
  return [
    // back tier — kissing the crest
    place(150,  0, "sea_fan_small_purple"),
    place(300,  2, "orange_open_antler"),
    place(440,  0, "plate_coral_shelf_green"),
    place(620,  0, "sea_fan_large_purple"),
    // mid tier — sunk a little into the bed
    place(40,  16, "plate_coral_stacked_cluster"),
    place(110, 14, "orange_dense_antler"),
    place(350, 18, "orange_low_branch"),
    place(495, 14, "orange_finger_cluster"),
    place(545, 16, "tan_sponge_tube_cluster"),
    // foreground tier — settled deep in the sand, nearest the viewer
    place(85,  36, "orange_staghorn_bushy"),
    place(200, 40, "mixed_rock_coral_base"),
    place(325, 34, "low_pink_coral_mound"),
    place(470, 42, "blue_green_polyp_cluster"),
    place(590, 32, "orange_knob_cluster"),
  ];
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
        sandShadow(x, y, top);
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
  paintRuins(buf);
  paintSand(buf);
  return buf;
}

// DOM bake -> data URL for kaplay's loadSprite. Async because the coral atlas
// is loaded via HTMLImageElement to get alpha-composited drawImage blitting.
export async function makeBackdrop(seed = 1): Promise<string> {
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
  await blitCoralAtlas(ctx);
  return canvas.toDataURL();
}

function blitCoralAtlas(ctx: CanvasRenderingContext2D): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      const CELL = CORAL_ATLAS_CELL;
      for (const { name, x, y } of coralBlits()) {
        const { col, row, top, bottom } = CORAL_ATLAS_LAYOUT[name];
        // Blit only the coral's main-body rows; clipping to [top, bottom] drops
        // disconnected atlas-edge specks that would otherwise float in the water.
        const sh = bottom - top + 1;
        ctx.drawImage(img, col * CELL, row * CELL + top, CELL, sh, x, y + top, CELL, sh);
      }
      resolve();
    };
    img.onerror = reject;
    img.src = CORAL_ATLAS;
  });
}
