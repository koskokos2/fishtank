// Turning the native fish atlas into animated sprites. These helpers
// are pure (RGBA buffers in, RGBA buffers out) and touch no DOM, so the same code
// drives the in-app canvas bake (fish.ts) and the headless previewer (preview.ts).
//
// The atlas frames are static, so the "swim" is synthesized: each fish is
// copied from its 128px cell, then a few frames are baked by shearing the rear of
// the body vertically along a sine. The tail end sweeps up and down while the
// head stays put, reading as a caudal beat. Shears are whole-pixel column shifts,
// so the art stays on the integer pixel grid under the global nearest-neighbour
// filter. The motion model then plays these frames at a speed tied to swim speed.

export type Buf = { data: Uint8Array; w: number; h: number };

export const SWIM_FRAMES = 6;
const SHEAR_AMP = 4; // peak tail shift, in native sprite pixels
const SHEAR_PIVOT = 0.45; // body fraction (from the head) where the tail starts to flex
const PAD = SHEAR_AMP; // vertical room each side so a shifted tail isn't clipped

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

// Copy a source rectangle into a tight sprite buffer without resampling.
export function copyRect(
  rgba: Uint8Array,
  imgW: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): Buf {
  const out = new Uint8Array(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * imgW + sx + x) * 4;
      const di = (y * sw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { data: out, w: sw, h: sh };
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
// in height). Each frame is the native fish crop with its tail sheared.
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
