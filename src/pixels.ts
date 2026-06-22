// Shared pixel-art shading helpers. These bake volume and edges into the
// procedurally-drawn creatures (currently the octopus in cephalopod.ts): a
// hue-shifted color ramp (shadows cooler + more saturated, highlights warmer +
// desaturated) and a selective outline that tints with the local color.
//
// Fish are no longer procedural — they come from a downscaled photo-real atlas
// (see fish.ts / fishbake.ts) — so the fish silhouette/markings code that used to
// live here is gone; only the reusable shading primitives remain.

import { type RGBA, hslToRgb, clamp01, lerp } from "./color";

const EMPTY = 0; // the empty region code selectiveOutline scans against

const RAMP_STEPS = 6;

// HSL triple. Markings are authored in HSL so the shared ramp can hue-shift them
// consistently.
export type FishColor = { h: number; s: number; l: number };

// Hue-shifted value ramp: index 0 is the deepest shadow (cooler, more saturated),
// the top index the brightest highlight (warmer, desaturated). Shading a sprite
// along this ramp — rather than tint/shade of one hue — is what gives it life.
// The swing is kept gentle so vivid base colors stay saturated on the lit flank
// rather than blowing out to white.
export function buildRamp({ h, s, l }: FishColor): RGBA[] {
  const ramp: RGBA[] = [];
  for (let i = 0; i < RAMP_STEPS; i++) {
    const t = i / (RAMP_STEPS - 1);
    ramp.push(
      hslToRgb(
        h + lerp(-12, 8, t),
        clamp01(s * lerp(1.12, 0.85, t)),
        clamp01(l + lerp(-0.17, 0.15, t)),
      ),
    );
  }
  return ramp;
}

// One ramp per distinct base color, built on demand and cached so a per-pixel
// colorizer that repeats colors stays cheap.
const rampCache = new Map<string, RGBA[]>();
export function rampFor(c: FishColor): RGBA[] {
  const key = `${c.h.toFixed(1)}|${c.s.toFixed(3)}|${c.l.toFixed(3)}`;
  let r = rampCache.get(key);
  if (!r) {
    r = buildRamp(c);
    rampCache.set(key, r);
  }
  return r;
}

export const shade = (c: RGBA, f: number): RGBA => [
  Math.round(c[0] * f),
  Math.round(c[1] * f),
  Math.round(c[2] * f),
  255,
];

// Selective outline: each empty pixel touching the silhouette takes the
// bordering color (chosen by `edge`), reading the first solid neighbor in
// down/up/left/right order. `casts` decides which codes cast an outline (so a
// caller can exempt thin features that would otherwise grow a halo); `edge`
// receives the source color plus the down/up neighbor codes so it can special-
// case a top contour. The empty code must be 0 (falsy) for the neighbor checks.
export function selectiveOutline(
  mask: number[],
  buf: RGBA[],
  w: number,
  h: number,
  casts: (code: number) => boolean,
  edge: (src: RGBA, down: number, up: number) => RGBA,
): RGBA[] {
  const out = buf.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== EMPTY) continue;
      const up = y > 0 && casts(mask[(y - 1) * w + x]) ? mask[(y - 1) * w + x] : EMPTY;
      const down =
        y < h - 1 && casts(mask[(y + 1) * w + x]) ? mask[(y + 1) * w + x] : EMPTY;
      const left = x > 0 && casts(mask[y * w + x - 1]) ? mask[y * w + x - 1] : EMPTY;
      const right =
        x < w - 1 && casts(mask[y * w + x + 1]) ? mask[y * w + x + 1] : EMPTY;
      if (!(down || up || left || right)) continue;

      const si = down
        ? (y + 1) * w + x
        : up
          ? (y - 1) * w + x
          : left
            ? y * w + x - 1
            : y * w + x + 1;
      out[y * w + x] = edge(buf[si], down, up);
    }
  }
  return out;
}
