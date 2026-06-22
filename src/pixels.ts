// Procedural pixel-art sprite generation. Every fish is rasterized into a tiny
// pixel grid here, baked to an offscreen canvas, and returned as a data URL for
// kaplay's loadSprite. No image files — a fish is just a Species.
//
// Shading follows standard pixel-art practice: a hue-shifted color ramp (shadows
// cooler + more saturated, highlights warmer + desaturated), the body shaded as
// a cylinder lit from the surface above for volume, and a selective outline that
// tints with the local color and catches a cool rim along the top edge.
//
// A Species owns everything that distinguishes one fish: the silhouette (body
// profile, fins, tail, eye/gill placement) AND a per-pixel `body()` function
// that returns the base color of each flank pixel — so multi-colored markings
// (koi blotches, pleco stripes, the neon-tetra band) live in the species, while
// the volumetric shading/outline pipeline below stays shared. A new fish is a
// new Species entry, never a change to the drawing code.

import { type RGBA, hslToRgb, clamp01, lerp } from "./color";

const W = 28;
const H = 18;
const CY = 9; // body centerline

// Region codes the rasterizer paints; the colorizer turns these into pixels.
const EMPTY = 0;
const BODY = 1;
const FIN = 2; // dorsal / pectoral / anal / caudal fin membrane
const FINRAY = 3; // darker striping along the fins
const PUPIL = 4;
const GLINT = 5;
const GILL = 6; // operculum rear edge (the head/body boundary)
const OPHI = 7; // lit edge of the operculum flap, just behind the seam
const PREOP = 8; // preopercle ridge on the cheek
const MOUTH = 9;
const BARBEL = 10; // koi whiskers trailing from the snout

const RAMP_STEPS = 6;

// HSL triple. Body markings are authored in HSL so the shared ramp can hue-shift
// them consistently; a per-individual jitter nudges these for variety.
export type FishColor = { h: number; s: number; l: number };

// A fin arc: a sine bump of peak height `h` over columns [x0, x1]. `period` is
// the sine's half-wavelength in columns; it defaults to the column span so the
// arc tapers to zero at both ends, but can run longer to leave the trailing edge
// cut off at a non-zero height.
type Fin = { x0: number; x1: number; h: number; period?: number };

// All fish share the 28x18 grid and face LEFT (snout at low x). The silhouette
// is two independent edges: `back` is the rows above the centerline at each
// column, `belly` the rows below it. `belly` defaults to `back` for a fish that
// is vertically symmetric (e.g. the round discus); giving them separate tables
// makes asymmetric bodies possible — a flat-bottomed pleco, a belly-heavy tetra.
// Columns absent from `back` are outside the body.
export type Species = {
  name: string;
  // Preferred vertical band as fractions of the swimmable height (0 = surface,
  // 1 = floor), from the fish's real-life habitat. Spawn position and the swim
  // target stay inside this band so each species favors its own level.
  level: { min: number; max: number };
  back: Record<number, number>;
  belly?: Record<number, number>;
  head: number; // snout column (lowest body x)
  tail: number; // last body column; the caudal fin begins at tail + 1
  gillCol: number; // base column of the operculum seam
  eyeX: number; // left column of the 2x2 pupil
  eyeY?: number; // top row of the pupil (defaults to CY - 2)
  eye?: RGBA; // pupil color (defaults to near-black)
  barbels?: boolean; // draw a pair of snout whiskers
  filament?: boolean; // draw a thin trailing streamer off the lower tail
  dorsal: Fin;
  anal: Fin;
  pectoral: { x0: number; x1: number };
  // Caudal tail: `spread` sets the outer flare, `fork` the depth of the central
  // notch (low = rounded paddle, high = deeply forked), `bend` the per-frame
  // flex, `len` how many columns it runs (defaults out to the grid edge).
  caudal: { spread: number; fork: number; bend: number; len?: number };
  body: (x: number, y: number, v: number) => FishColor; // flank base color
  fin: FishColor; // fin membrane base color
};

function bodyTop(x: number, sp: Species) {
  return Math.round(CY - (sp.back[x] ?? 0));
}
function bodyBottom(x: number, sp: Species) {
  return Math.round(CY + ((sp.belly ?? sp.back)[x] ?? 0));
}

// Texture helpers a species can fold into its base color: a diagonal scale
// highlight, and a fine dot speckle — both nudge lightness on a lattice so they
// never align into vertical/horizontal seams.
const lighten = (c: FishColor, d: number): FishColor => ({
  ...c,
  l: clamp01(c.l + d),
});
const scaled = (c: FishColor, x: number, y: number, top: number): FishColor =>
  (x * 2 + (y - top)) % 5 === 0 ? lighten(c, 0.05) : c;

// --- koi: stout carp body, pale ground with orange saddles, black sumi spots,
// long flowing fins and snout barbels. ---
const KOI_PALE: FishColor = { h: 205, s: 0.1, l: 0.82 };
const KOI_ORANGE: FishColor = { h: 24, s: 0.88, l: 0.55 };
const KOI_SUMI: FishColor = { h: 215, s: 0.25, l: 0.16 };
const KOI: Species = {
  name: "koi",
  level: { min: 0.04, max: 0.38 }, // surface-oriented pond fish — swims high
  // Elongated body with a gently humped back over a slightly fuller, rounder
  // belly; blunt head.
  back: {
    2: 2.0, 3: 3.2, 4: 4.0, 5: 4.6, 6: 5.0, 7: 5.3, 8: 5.5, 9: 5.5,
    10: 5.3, 11: 5.0, 12: 4.6, 13: 4.2, 14: 3.7, 15: 3.2, 16: 2.7,
    17: 2.2, 18: 1.8, 19: 1.4, 20: 1.1,
  },
  belly: {
    2: 1.8, 3: 3.0, 4: 3.9, 5: 4.6, 6: 5.1, 7: 5.4, 8: 5.6, 9: 5.7,
    10: 5.6, 11: 5.4, 12: 5.0, 13: 4.5, 14: 4.0, 15: 3.4, 16: 2.8,
    17: 2.3, 18: 1.8, 19: 1.4, 20: 1.1,
  },
  head: 2,
  tail: 20,
  gillCol: 7,
  eyeX: 4,
  barbels: true,
  dorsal: { x0: 8, x1: 17, h: 3.2 },
  anal: { x0: 14, x1: 18, h: 2.4 },
  pectoral: { x0: 6, x1: 10 },
  caudal: { spread: 7.5, fork: 4.5, bend: 1.3 },
  fin: { h: 205, s: 0.12, l: 0.84 },
  body(x, y, v) {
    const spot = (cx: number, cy: number, rx: number, ry: number) =>
      ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    if (spot(9, CY - 2, 1.7, 2.3) || spot(13, CY - 2, 1.9, 2.4) || spot(16, CY - 1, 1.5, 1.9))
      return KOI_SUMI;
    const orange =
      x <= 7 || (v < 0.5 && (x <= 10 || (x >= 12 && x <= 15) || (x >= 17 && x <= 19)));
    if (orange) return KOI_ORANGE;
    return scaled(KOI_PALE, x, y, bodyTop(x, KOI));
  },
};

// --- royal pleco: armored catfish, deep sloped head tapering back, dark body
// with fine gold longitudinal pinstripes, tall sail dorsal, big fan tail. ---
const PLECO_DARK: FishColor = { h: 34, s: 0.5, l: 0.18 };
const PLECO_GOLD: FishColor = { h: 43, s: 0.58, l: 0.5 };
const PLECO: Species = {
  name: "pleco",
  level: { min: 0.76, max: 0.97 }, // suckermouth catfish — hugs the bottom
  // Bottom-dweller: a near-flat belly running the front two-thirds, under a back
  // that arches to a hump beneath the sail dorsal then slopes to the peduncle.
  back: {
    1: 1.6, 2: 2.9, 3: 3.9, 4: 4.7, 5: 5.3, 6: 5.6, 7: 5.7, 8: 5.6,
    9: 5.3, 10: 5.0, 11: 4.6, 12: 4.2, 13: 3.8, 14: 3.4, 15: 3.0,
    16: 2.6, 17: 2.2, 18: 1.8, 19: 1.5, 20: 1.2, 21: 1.0,
  },
  belly: {
    1: 1.2, 2: 2.2, 3: 3.0, 4: 3.5, 5: 3.7, 6: 3.8, 7: 3.8, 8: 3.8,
    9: 3.7, 10: 3.5, 11: 3.2, 12: 2.9, 13: 2.5, 14: 2.2, 15: 1.9,
    16: 1.6, 17: 1.4, 18: 1.2, 19: 1.0, 20: 0.9, 21: 0.8,
  },
  head: 1,
  tail: 21,
  gillCol: 6,
  eyeX: 4,
  eyeY: CY - 3,
  eye: [228, 150, 48, 255],
  dorsal: { x0: 5, x1: 13, h: 4.5 },
  anal: { x0: 15, x1: 18, h: 2 },
  pectoral: { x0: 6, x1: 10 },
  caudal: { spread: 6.5, fork: 2.2, bend: 1 },
  fin: { h: 40, s: 0.5, l: 0.4 },
  body(_x, _y, v) {
    return Math.round(v * 9) % 2 === 0 ? PLECO_GOLD : PLECO_DARK;
  },
};

// --- discus: near-circular disc, laterally compressed, teal ground with a fine
// dot speckle and darker vertical bars on the rear flank, small fins. ---
const DISCUS_BASE: FishColor = { h: 165, s: 0.32, l: 0.5 };
const DISCUS_BAR: FishColor = { h: 175, s: 0.35, l: 0.34 };
const DISCUS: Species = {
  name: "discus",
  level: { min: 0.34, max: 0.64 }, // calm mid-water cichlid — holds the middle
  // Near-circular and vertically symmetric, so `belly` is left to mirror `back`:
  // height ≈ length over a short column span gives the round disc.
  back: {
    4: 2.2, 5: 4.2, 6: 5.6, 7: 6.6, 8: 7.2, 9: 7.5, 10: 7.5,
    11: 7.2, 12: 6.6, 13: 5.7, 14: 4.6, 15: 3.4, 16: 2.2, 17: 1.4,
    18: 0.9,
  },
  head: 4,
  tail: 18,
  gillCol: 8,
  eyeX: 6,
  eye: [205, 55, 45, 255],
  filament: true,
  dorsal: { x0: 4, x1: 16, h: 2 },
  anal: { x0: 5, x1: 16, h: 2 },
  pectoral: { x0: 8, x1: 10 },
  caudal: { spread: 3.5, fork: 1.2, bend: 0.8, len: 5 },
  fin: { h: 170, s: 0.3, l: 0.34 },
  body(x, y, v) {
    let c = DISCUS_BASE;
    if (x >= 11 && Math.round(x) % 3 === 0) c = DISCUS_BAR;
    if ((x * 3 + y * 2) % 5 === 0 && (x + y) % 2 === 0) c = lighten(c, 0.1);
    return c;
  },
};

// --- neon tetra: small slender body, teal back, a bright neon mid-stripe, a
// lavender belly up front and a red-orange rear, with pale translucent fins. ---
const NEON_TEAL: FishColor = { h: 188, s: 0.55, l: 0.46 };
const NEON_STRIPE: FishColor = { h: 192, s: 0.78, l: 0.6 };
const NEON_LAV: FishColor = { h: 255, s: 0.28, l: 0.74 };
const NEON_RED: FishColor = { h: 12, s: 0.82, l: 0.55 };
const NEON: Species = {
  name: "neon",
  level: { min: 0.18, max: 0.5 }, // schools in the upper-middle water column
  // Spindle/torpedo: widest near the middle, tapering smoothly to a short
  // rounded snout up front and a slim peduncle at the tail. The front columns
  // ramp up gradually so the nose comes to a point ahead of the eye rather than
  // a flat vertical face; the belly is only slightly fuller than the back.
  back: {
    2: 0.9, 3: 2.0, 4: 3.0, 5: 3.7, 6: 4.1, 7: 4.3, 8: 4.4, 9: 4.3,
    10: 4.1, 11: 3.8, 12: 3.4, 13: 3.0, 14: 2.6, 15: 2.2, 16: 1.9,
    17: 1.6, 18: 1.3, 19: 1.1, 20: 0.9,
  },
  belly: {
    2: 1.0, 3: 2.4, 4: 3.5, 5: 4.2, 6: 4.6, 7: 4.8, 8: 4.7, 9: 4.5,
    10: 4.2, 11: 3.8, 12: 3.4, 13: 3.0, 14: 2.6, 15: 2.2, 16: 1.9,
    17: 1.6, 18: 1.3, 19: 1.1, 20: 0.9,
  },
  head: 2,
  tail: 20,
  gillCol: 6,
  eyeX: 4,
  dorsal: { x0: 8, x1: 12, h: 2 },
  anal: { x0: 12, x1: 16, h: 2 },
  pectoral: { x0: 6, x1: 8 },
  caudal: { spread: 4.5, fork: 3.5, bend: 1.1 },
  fin: { h: 48, s: 0.14, l: 0.87 },
  body(x, _y, v) {
    if (x >= 12 && v > 0.45) return NEON_RED;
    if (v < 0.3) return NEON_TEAL;
    if (v < 0.52) return NEON_STRIPE;
    return NEON_LAV;
  },
};

export const FISH_SPECIES: Species[] = [KOI, PLECO, DISCUS, NEON];

// Hue-shifted value ramp: index 0 is the deepest shadow (cooler, more saturated),
// the top index the brightest highlight (warmer, desaturated). Shading a sprite
// along this ramp — rather than tint/shade of one hue — is what gives it life.
// The swing is kept gentle so vivid markings (koi saddles, the neon band) stay
// saturated on the lit flank rather than blowing out to white. Exported so the
// cephalopod sprites share the same shading style.
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

// One ramp per distinct base color, built on demand. A species' body() returns
// many repeated colors, so caching keeps the per-pixel colorizer cheap.
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

const solid = (code: number) => code !== EMPTY && code !== BARBEL;

function buildMask(sp: Species, frame: number): number[] {
  const m = new Array<number>(W * H).fill(EMPTY);
  const put = (x: number, y: number, v: number, force = false) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    if (force || m[y * W + x] === EMPTY) m[y * W + x] = v;
  };

  for (let x = sp.head; x <= sp.tail; x++)
    for (let y = bodyTop(x, sp); y <= bodyBottom(x, sp); y++)
      put(x, y, BODY, true);

  // Operculum (gill cover): its curved rear edge is the true head/body boundary,
  // so the seam is a crescent — a dark groove with a lit flap edge just behind it
  // — not a straight line. A fainter preopercle curve adds cheek structure.
  const onBody = (x: number, y: number, val: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H && m[y * W + x] === BODY)
      m[y * W + x] = val;
  };
  const ocol = sp.gillCol - 2;
  const odenom = (sp.back[ocol] ?? 4) + 1.6;
  for (let y = bodyTop(ocol, sp); y <= bodyBottom(ocol, sp); y++) {
    const gx = sp.gillCol + Math.round(1.8 * (1 - Math.abs(y - CY) / odenom));
    onBody(gx, y, GILL);
    onBody(gx + 1, y, OPHI);
  }
  for (let y = CY - 2; y <= CY + 2; y++) {
    const px = sp.gillCol - 1 + Math.round(0.6 * (1 - Math.abs(y - CY) / 3));
    onBody(px, y, PREOP);
  }

  // Fin arcs: a sine bump along the back (dorsal) and under the rear (anal).
  const finArc = (f: Fin, x: number) => {
    const period = f.period ?? f.x1 - f.x0;
    return Math.round(f.h * Math.sin((Math.PI * (x - f.x0)) / period));
  };
  for (let x = sp.dorsal.x0; x <= sp.dorsal.x1; x++) {
    const h = finArc(sp.dorsal, x);
    for (let y = bodyTop(x, sp) - h; y < bodyTop(x, sp); y++) put(x, y, FIN);
  }
  for (let x = sp.anal.x0; x <= sp.anal.x1; x++) {
    const h = finArc(sp.anal, x);
    for (let y = bodyBottom(x, sp) + 1; y <= bodyBottom(x, sp) + h; y++)
      put(x, y, FIN);
  }

  // Pectoral fin sweeping down and back over the flank.
  for (let x = sp.pectoral.x0; x <= sp.pectoral.x1; x++)
    for (let y = CY + 1; y <= CY + 1 + (x - sp.pectoral.x0); y++)
      put(x, y, FIN, true);

  // Forked caudal tail flexing as a wave; the tip bends per frame.
  const bend = (frame === 1 ? 1.0 : -1.0) * sp.caudal.bend;
  const clen = sp.caudal.len ?? W - 1 - sp.tail;
  const xend = Math.min(W - 1, sp.tail + clen);
  for (let x = sp.tail + 1; x <= xend; x++) {
    const t = (x - sp.tail) / clen;
    const tcy = CY + bend * Math.pow(t, 1.6);
    const outer = 1 + sp.caudal.spread * Math.pow(t, 0.8);
    const inner = sp.caudal.fork * Math.pow(t, 2.2);
    for (let y = 0; y < H; y++) {
      const d = Math.abs(y - tcy);
      if (d > outer || d < inner) continue;
      const ray = Math.round(Math.atan2(y - CY, x - (sp.tail - 1)) / 0.22);
      put(x, y, ray % 2 === 0 ? FINRAY : FIN);
    }
  }

  // Eye: a small dark eye set high on the cheek with one bright catch-light.
  const ey = sp.eyeY ?? CY - 2;
  put(sp.eyeX, ey, PUPIL, true);
  put(sp.eyeX + 1, ey, PUPIL, true);
  put(sp.eyeX, ey + 1, PUPIL, true);
  put(sp.eyeX + 1, ey + 1, PUPIL, true);
  put(sp.eyeX, ey, GLINT, true);
  // Mouth: a small dark notch at the snout tip.
  put(sp.head, CY, MOUTH, true);

  // Barbels: a pair of short whiskers trailing forward from the snout.
  if (sp.barbels) {
    put(sp.head - 1, CY + 1, BARBEL, true);
    put(sp.head - 2, CY + 2, BARBEL, true);
    put(sp.head - 1, CY + 2, BARBEL, true);
  }

  // Filament: a thin streamer trailing back and down off the lower caudal.
  if (sp.filament) {
    const fx = sp.tail + 1;
    const fy = CY + Math.round((sp.belly ?? sp.back)[sp.tail] ?? 1);
    for (let i = 0; i < 5; i++)
      put(fx + i, fy + Math.round(i * 0.8), FINRAY);
  }

  return m;
}

// Light value at a body pixel, modelling the flank as a cylinder lit from the
// surface above: bright along the back, falling toward the belly, with a sheen
// on the topmost curve and a touch of light bouncing back onto the underside.
function bodyLight(x: number, y: number, sp: Species): number {
  const top = bodyTop(x, sp);
  const span = Math.max(1, bodyBottom(x, sp) - top);
  const v = clamp01((y - top) / span);
  let L = Math.pow(0.22 + 0.78 * (1 - v), 0.9);
  if (v < 0.1) L += 0.13; // dorsal sheen
  if (v > 0.86) L += 0.14; // reflected light off the belly
  return clamp01(L);
}

function bodyBase(x: number, y: number, sp: Species): FishColor {
  const top = bodyTop(x, sp);
  const span = Math.max(1, bodyBottom(x, sp) - top);
  return sp.body(x, y, (y - top) / span);
}

function colorOf(code: number, x: number, y: number, sp: Species): RGBA {
  switch (code) {
    case BODY:
    case GILL:
    case OPHI:
    case PREOP: {
      const ramp = rampFor(bodyBase(x, y, sp));
      let idx = Math.round(bodyLight(x, y, sp) * (RAMP_STEPS - 1));
      if (code === GILL || code === PREOP) idx -= 1;
      if (code === OPHI) idx += 1;
      return ramp[Math.max(0, Math.min(RAMP_STEPS - 1, idx))];
    }
    case FIN:
      return withAlpha(rampFor(sp.fin)[3], 205);
    case FINRAY:
      return withAlpha(rampFor(sp.fin)[1], 205);
    case PUPIL:
      return sp.eye ?? [22, 24, 32, 255];
    case GLINT:
      return [250, 252, 255, 255];
    case BARBEL:
      return shade(rampFor(bodyBase(sp.head, CY, sp))[2], 0.7);
    case MOUTH:
      return shade(rampFor(bodyBase(x, y, sp))[0], 0.5);
    default:
      return [0, 0, 0, 0];
  }
}

export const withAlpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];
export const shade = (c: RGBA, f: number): RGBA => [
  Math.round(c[0] * f),
  Math.round(c[1] * f),
  Math.round(c[2] * f),
  255,
];

// Selective outline: each empty pixel touching the silhouette takes the
// bordering color (chosen by `edge`), reading the first solid neighbor in
// down/up/left/right order. `casts` decides which codes cast an outline (so a
// caller can exempt e.g. thin whiskers that would otherwise grow a halo); `edge`
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

// Cool, slightly-lit rim along the back's top contour.
export const rim = (c: RGBA): RGBA => [
  Math.round(c[0] * 0.7),
  Math.round(c[1] * 0.8),
  Math.round(Math.min(255, c[2] * 0.95 + 12)),
  255,
];

function buildFrame(sp: Species, frame: number): RGBA[] {
  const mask = buildMask(sp, frame);
  const buf: RGBA[] = mask.map((code, i) =>
    colorOf(code, i % W, Math.floor(i / W), sp),
  );

  // Each empty pixel touching the silhouette takes the bordering body color,
  // darkened; a pure top edge over the body instead gets a lighter, cooler rim,
  // as if catching light from the surface. Barbels don't cast an outline.
  return selectiveOutline(mask, buf, W, H, solid, (src, down, up) =>
    down === BODY && up === EMPTY ? rim(src) : shade(src, 0.42),
  );
}

export const FISH_W = W;
export const FISH_H = H;

// Raw RGBA pixels for one frame (length W*H). Used by the headless previewer;
// makeFishSheet is the browser path that bakes these onto a canvas.
export function fishFrame(sp: Species, frame: number): RGBA[] {
  return buildFrame(sp, frame);
}

// Two animation frames laid out side by side into one sprite sheet.
export function makeFishSheet(sp: Species): string {
  const sheetW = W * 2;
  const canvas = document.createElement("canvas");
  canvas.width = sheetW;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(sheetW, H);

  for (let frame = 0; frame < 2; frame++) {
    const buf = buildFrame(sp, frame);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b, a] = buf[y * W + x];
        const px = (y * sheetW + (x + frame * W)) * 4;
        img.data[px] = r;
        img.data[px + 1] = g;
        img.data[px + 2] = b;
        img.data[px + 3] = a;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
