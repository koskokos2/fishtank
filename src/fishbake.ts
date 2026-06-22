// Turning the realistic fish atlas into small, animated sprites. These helpers
// are pure (RGBA buffers in, RGBA buffers out) and touch no DOM, so the same code
// drives the in-app canvas bake (fish.ts) and the headless previewer (preview.ts).
//
// The atlas frames are static, so the "swim" is synthesized: each fish is
// downscaled, then a few frames are baked by shearing the rear of the body
// vertically along a sine — the tail end sweeps up and down while the head stays
// put, reading as a caudal beat. Shears are whole-pixel column shifts, so the art
// stays on the integer pixel grid (no blur) under the global nearest-neighbour
// filter. The motion model then plays these frames at a speed tied to swim speed.

import { RES } from "./res";

export type Buf = { data: Uint8Array; w: number; h: number };

// Uniform downscale applied to every cell's tight crop, so the natural size
// difference between a big angelfish and a small tetra is preserved. Scaled by
// RES so the fish carry the same pixel density as the rest of the scene — at
// RES=2 a fish bakes to ~64px of detail.
export const FISH_SCALE = 0.32 * RES;
export const SWIM_FRAMES = 6;
const SHEAR_AMP = 2 * RES; // peak tail shift, in downscaled pixels
const SHEAR_PIVOT = 0.45; // body fraction (from the head) where the tail starts to flex
const PAD = SHEAR_AMP; // vertical room each side so a shifted tail isn't clipped

// Downscaled sprite size for a tight crop of the given atlas dimensions. Shared
// so the runtime and headless paths agree on every fish's pixel size.
export function fishDims(bw: number, bh: number) {
  return { dw: Math.max(1, Math.round(bw * FISH_SCALE)), dh: Math.max(1, Math.round(bh * FISH_SCALE)) };
}

// Tight bounding box of the non-transparent pixels inside one atlas cell.
export function cellBBox(rgba: Uint8Array, imgW: number, x0: number, y0: number, cell: number) {
  let minX = cell, minY = cell, maxX = -1, maxY = -1;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (rgba[((y0 + y) * imgW + (x0 + x)) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, bw: cell, bh: cell }; // empty cell — shouldn't happen
  return { x: x0 + minX, y: y0 + minY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}

// Box-average downscale of a sub-rectangle of a source RGBA image. Used by the
// headless previewer; the in-app path uses the browser's higher-quality canvas
// resampler instead, but both feed the same shear stage below.
export function downscaleBox(
  rgba: Uint8Array,
  imgW: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Buf {
  const out = new Uint8Array(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      const x0 = sx + Math.floor((dx * sw) / dw);
      const x1 = Math.max(x0 + 1, sx + Math.floor(((dx + 1) * sw) / dw));
      const y0 = sy + Math.floor((dy * sh) / dh);
      const y1 = Math.max(y0 + 1, sy + Math.floor(((dy + 1) * sh) / dh));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * imgW + x) * 4;
          const af = rgba[i + 3] / 255;
          r += rgba[i] * af;
          g += rgba[i + 1] * af;
          b += rgba[i + 2] * af;
          a += rgba[i + 3];
          n++;
        }
      }
      const di = (dy * dw + dx) * 4;
      // premultiplied average, un-premultiplied back out so edges don't darken
      const aw = a / 255;
      out[di] = aw ? Math.round(r / aw) : 0;
      out[di + 1] = aw ? Math.round(g / aw) : 0;
      out[di + 2] = aw ? Math.round(b / aw) : 0;
      out[di + 3] = Math.round(a / n);
    }
  }
  return out2buf(out, dw, dh);
}

function out2buf(data: Uint8Array, w: number, h: number): Buf {
  return { data, w, h };
}

// Per-column vertical shift for frame `f`: zero over the head, rising toward the
// tail and oscillating as a travelling wave so the body looks like it undulates.
function shearShift(x: number, w: number, f: number): number {
  const xp = w * SHEAR_PIVOT;
  if (x <= xp) return 0;
  const t = (x - xp) / Math.max(1, w - 1 - xp); // 0 at pivot → 1 at tail tip
  const phase = (2 * Math.PI * f) / SWIM_FRAMES;
  return Math.round(SHEAR_AMP * t * Math.sin(phase - Math.PI * t));
}

// Lay the swim frames out side by side into one sheet buffer (frames wide, padded
// in height). Each frame is the downscaled fish with its tail sheared.
export function shearSheet(fish: Buf): Buf {
  const fh = fish.h + PAD * 2;
  const sheetW = fish.w * SWIM_FRAMES;
  const data = new Uint8Array(sheetW * fh * 4);
  for (let f = 0; f < SWIM_FRAMES; f++) {
    const ox = f * fish.w;
    for (let x = 0; x < fish.w; x++) {
      const shift = shearShift(x, fish.w, f);
      for (let y = 0; y < fish.h; y++) {
        const si = (y * fish.w + x) * 4;
        if (fish.data[si + 3] === 0) continue;
        const dy = y + PAD + shift;
        if (dy < 0 || dy >= fh) continue;
        const di = (dy * sheetW + (ox + x)) * 4;
        data[di] = fish.data[si];
        data[di + 1] = fish.data[si + 1];
        data[di + 2] = fish.data[si + 2];
        data[di + 3] = fish.data[si + 3];
      }
    }
  }
  return { data, w: sheetW, h: fh };
}
