// Turning the native fish atlas into animated sprites. These helpers
// are pure (RGBA buffers in, RGBA buffers out) and touch no DOM, so the same code
// drives the in-app canvas bake (fish.ts) and the headless previewer (preview.ts).
//
// The atlas poses are static, so a four-frame swim is synthesized for each fish.
// Species select one of four motion profiles: a normal tail beat, slower flowing
// fins, whole-body eel undulation, or a restrained paddle. All offsets remain on
// the integer pixel grid under the global nearest-neighbour filter, and playback
// speed stays tied to both the fish's swim speed and its motion profile.

export type Buf = { data: Uint8Array; w: number; h: number };

export const SWIM_FRAMES = 4;
export type FishMotionProfile = "standard" | "flowing" | "eel" | "paddle";

const PROFILE = {
  standard: { amp: 4, pivot: 0.45, flutter: 0, beat: 1 },
  flowing: { amp: 4, pivot: 0.38, flutter: 2, beat: 0.68 },
  eel: { amp: 3, pivot: 0, flutter: 0, beat: 0.78 },
  paddle: { amp: 2, pivot: 0.58, flutter: 1, beat: 0.58 },
} as const;
const PAD = 6; // covers tail bend plus flowing-fin expansion without clipping

export function motionBeatScale(profile: FishMotionProfile): number {
  return PROFILE[profile].beat;
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
function swimShift(
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  profile: FishMotionProfile,
): number {
  const p = PROFILE[profile];
  const phase = (2 * Math.PI * f) / SWIM_FRAMES;
  if (profile === "eel") {
    // Whole-body travelling S-wave: tiny at the head, strongest at the tail.
    const along = x / Math.max(1, w - 1);
    const envelope = 0.12 + along * 0.88;
    return Math.round(p.amp * envelope * Math.sin(phase - Math.PI * 1.35 * along));
  }

  const xp = w * p.pivot;
  const tail = x <= xp ? 0 : (x - xp) / Math.max(1, w - 1 - xp);
  let shift = p.amp * tail * Math.sin(phase);
  if (p.flutter) {
    // Fancy/slow swimmers breathe their dorsal and ventral fin edges while the
    // tail sweeps. Opposite signs above/below the body expand then relax the fins.
    const mid = (h - 1) / 2;
    const edge = Math.abs(y - mid) / Math.max(1, mid);
    const finReach = Math.max(0, (x / Math.max(1, w - 1) - 0.12) / 0.88);
    shift += Math.sign(y - mid) * p.flutter * edge * finReach * Math.cos(phase);
  }
  return Math.round(shift);
}

// Lay the swim frames out side by side into one sheet buffer (frames wide, padded
// in height). Each frame is the native fish crop transformed by its profile.
export function shearSheet(
  fish: Buf,
  profile: FishMotionProfile = "standard",
): Buf {
  const fh = fish.h + PAD * 2;
  const sheetW = fish.w * SWIM_FRAMES;
  const data = new Uint8Array(sheetW * fh * 4);
  for (let f = 0; f < SWIM_FRAMES; f++) {
    const ox = f * fish.w;
    for (let x = 0; x < fish.w; x++) {
      // The flutter term shifts pixels by a y-dependent amount, so a column can be
      // stretched vertically and a plain scatter would skip destination rows. Track
      // the previous opaque source row's destination and fill the span between it
      // and this one — but only across vertically adjacent source pixels, so real
      // transparent gaps in the fin shape are never bridged.
      let prevY = -2;
      let prevDy = 0;
      for (let y = 0; y < fish.h; y++) {
        const si = (y * fish.w + x) * 4;
        if (fish.data[si + 3] === 0) continue;
        const dy = y + PAD + swimShift(x, y, fish.w, fish.h, f, profile);
        const from = prevY === y - 1 && dy - prevDy > 1 ? prevDy + 1 : dy;
        for (let dyy = from; dyy <= dy; dyy++) {
          if (dyy < 0 || dyy >= fh) continue;
          const di = (dyy * sheetW + (ox + x)) * 4;
          data[di] = fish.data[si];
          data[di + 1] = fish.data[si + 1];
          data[di + 2] = fish.data[si + 2];
          data[di + 3] = fish.data[si + 3];
        }
        prevY = y;
        prevDy = dy;
      }
    }
  }
  return { data, w: sheetW, h: fh };
}
