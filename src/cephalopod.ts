// Cephalopods: a second creature type alongside the fish. One entity, two kinds
// (octopus, nautilus) — the same split the fish use for species. Each kind has a
// rigid BODY baked to a sprite via the shared pixel/shading pipeline (so the art
// matches the fish), plus ARMS that are NOT baked: a central draw layer renders
// them per frame as tapering, waving curves in world space (the "moving legs").
//
// The octopus body is procedural (baked here); the nautilus body is cropped from
// the sea-creature pixel-art atlas and given a baked tentacle-wiggle sheet, like
// the fish tail-swish bake. The octopus keeps per-frame procedural arms; the
// nautilus's tentacles are baked into its sprite frames, so it carries no arm
// config.
//
// Motion differs by nature (see the per-kind config):
//  - Octopus: mostly slow, irregular, omnidirectional crawl-drift low in the
//    tank (orientation decoupled from travel), with rare fast mantle-first jets.
//  - Nautilus: pulsatile jet — posterior-first (body leading) most of the time,
//    occasional anterior-first amble, with a squash-flip turnaround.

import type { KAPLAYCtx } from "kaplay";
import { type RGBA } from "./color";
import { type FishColor, rampFor, shade, selectiveOutline } from "./pixels";
import {
  SEA_CREATURES_ATLAS,
  SEA_CREATURES_ATLAS_CELL,
  SEA_CREATURES_ATLAS_COLS,
  SEA_CREATURE_NAUTILUS_INDEX,
  SEA_CREATURE_JELLYFISH_INDEX,
} from "./seaCreaturesAtlas";
import {
  type Buf,
  SWIM_FRAMES,
  cellBBox,
  copyRect,
} from "./fishbake";
import { RES } from "./res";

const S = RES;
const STEPS = 6; // ramp length from buildRamp/rampFor

// Region codes for the octopus body builder.
const EMPTY = 0;
const BODY = 1;
const PUPIL = 3;
const GLINT = 4;
const RING = 5; // amber eye-ring

// --- shared bake: a raw RGBA buffer → data URL (mirrors makeFishSheet) ---
function bake(px: RGBA[], w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = px[i];
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// =========================== OCTOPUS ===========================
// Side / three-quarter view facing LEFT: a bulbous mantle dome trailing up-and-
// back (the rear), a rounded head below-forward carrying one big amber eye, and
// an arm crown at the front-lower edge. The eight curling, suckered arms are
// drawn per frame (not baked) by the arm layer below.
export const OCTO_W = 32 * S;
export const OCTO_H = 28 * S;
const OCTO_BASE: FishColor = { h: 288, s: 0.13, l: 0.54 };

export function octopusPixels(): RGBA[] {
  const W = OCTO_W;
  const H = OCTO_H;
  const code = new Array<number>(W * H).fill(EMPTY);
  const ell = (cx: number, cy: number, rx: number, ry: number, c: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) code[y * W + x] = c;
      }
  };

  ell(19 * S, 10 * S, 10 * S, 9 * S, BODY); // mantle dome (upper, rear-right), egg-tall
  ell(12 * S, 17 * S, 8 * S, 6 * S, BODY); // head (lower-left, the front)

  // Big amber eye on the head, looking left: dark pupil ringed in gold + a glint.
  ell(8 * S, 17 * S, 3 * S, 3 * S, RING);
  for (let y = 16 * S; y < 18 * S; y++)
    for (let x = 7 * S; x < 9 * S; x++) code[y * W + x] = PUPIL;
  for (let y = 16 * S; y < 17 * S; y++)
    for (let x = 7 * S; x < 8 * S; x++) code[y * W + x] = GLINT;

  const ramp = rampFor(OCTO_BASE);
  const buf: RGBA[] = code.map((c, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    // Top-lit so the mantle dome reads round.
    const L = Math.max(0, Math.min(1, 0.9 - ((y - 2 * S) / (H - 4 * S)) * 0.62));
    let idx = Math.round(L * (STEPS - 1));
    if (c === BODY) {
      if ((x * 2 + y) % 5 === 0) idx += 1; // reticulated skin sheen
      if ((x * 3 + y * 2) % 7 === 0) idx -= 1; // mottle
      return ramp[Math.max(0, Math.min(STEPS - 1, idx))];
    }
    if (c === RING) return [214, 168, 90, 255];
    if (c === PUPIL) return [26, 20, 28, 255];
    if (c === GLINT) return [250, 248, 238, 255];
    return [0, 0, 0, 0];
  });

  return selectiveOutline(code, buf, W, H, (c) => c !== EMPTY, (src) =>
    shade(src, 0.5),
  );
}

export const makeOctopus = () => bake(octopusPixels(), OCTO_W, OCTO_H);

// =========================== NAUTILUS ===========================
// The nautilus starts as one native 128px atlas cell, then gets the same kind of
// no-resampling frame bake as fish. Only the lower-left tentacle region flexes;
// the shell and head remain rigid.
export const NAUTILUS_FRAMES = SWIM_FRAMES;
const NAUT_TENTACLE_AMP = 4;
const NAUT_TENTACLE_PIVOT = 0.46;
const NAUT_TENTACLE_PAD = NAUT_TENTACLE_AMP;

export async function makeNautilusSprite(): Promise<string> {
  return bufToDataURL(tentacleSheet(await cropAtlasCell(SEA_CREATURE_NAUTILUS_INDEX)));
}

// Crop one sea-creature atlas cell to a tight RGBA buffer (no resampling), the
// shared starting point for the nautilus and jellyfish animation bakes.
async function cropAtlasCell(index: number): Promise<Buf> {
  const img = await loadImage(SEA_CREATURES_ATLAS);
  const cell = SEA_CREATURES_ATLAS_CELL;
  const col = index % SEA_CREATURES_ATLAS_COLS;
  const row = Math.floor(index / SEA_CREATURES_ATLAS_COLS);

  const scratch = document.createElement("canvas");
  scratch.width = img.width;
  scratch.height = img.height;
  const sctx = scratch.getContext("2d")!;
  sctx.drawImage(img, 0, 0);
  const full = new Uint8Array(
    sctx.getImageData(0, 0, img.width, img.height).data.buffer,
  );

  const bb = cellBBox(full, img.width, col * cell, row * cell, cell);
  return copyRect(full, img.width, bb.x, bb.y, bb.bw, bb.bh);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function bufToDataURL(b: Buf): string {
  const canvas = document.createElement("canvas");
  canvas.width = b.w;
  canvas.height = b.h;
  const ctx = canvas.getContext("2d")!;
  const id = ctx.createImageData(b.w, b.h);
  id.data.set(b.data);
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL();
}

function tentacleShift(x: number, y: number, w: number, h: number, f: number): number {
  const pivot = w * NAUT_TENTACLE_PIVOT;
  if (x >= pivot || y < h * 0.36) return 0;

  const front = (pivot - x) / Math.max(1, pivot);
  const lower = Math.min(1, Math.max(0, (y - h * 0.36) / (h * 0.42)));
  const phase = (2 * Math.PI * f) / NAUTILUS_FRAMES;
  return Math.round(
    NAUT_TENTACLE_AMP *
      front *
      lower *
      Math.sin(phase + Math.PI * front + y * 0.12),
  );
}

function tentacleSheet(nautilus: Buf): Buf {
  const fh = nautilus.h + NAUT_TENTACLE_PAD * 2;
  const sheetW = nautilus.w * NAUTILUS_FRAMES;
  const data = new Uint8Array(sheetW * fh * 4);

  for (let f = 0; f < NAUTILUS_FRAMES; f++) {
    const ox = f * nautilus.w;
    for (let x = 0; x < nautilus.w; x++) {
      for (let y = 0; y < nautilus.h; y++) {
        const si = (y * nautilus.w + x) * 4;
        if (nautilus.data[si + 3] === 0) continue;
        const dy =
          y +
          NAUT_TENTACLE_PAD +
          tentacleShift(x, y, nautilus.w, nautilus.h, f);
        if (dy < 0 || dy >= fh) continue;
        const di = (dy * sheetW + ox + x) * 4;
        data[di] = nautilus.data[si];
        data[di + 1] = nautilus.data[si + 1];
        data[di + 2] = nautilus.data[si + 2];
        data[di + 3] = nautilus.data[si + 3];
      }
    }
  }

  return { data, w: sheetW, h: fh };
}

// =========================== JELLYFISH ===========================
// One native atlas cell (a translucent bell with tentacles hanging straight down).
// The rigid bell stays put; the tentacle curtain below the bell margin sways as a
// full-width travelling wave — whole-pixel horizontal column shifts, so the art
// stays crisp like the fish/nautilus bakes. The bell *pulse* (the propulsive
// squash) is not baked: it's a runtime scale.y squash in spawnCephalopod, synced
// to the thrust so pump and propulsion read as one motion.
export const JELLYFISH_FRAMES = SWIM_FRAMES;
const JELLY_TENTACLE_AMP = 4; // peak sideways tip swing, in native sprite pixels
const JELLY_BELL_MARGIN = 0.42; // body fraction (from the top) where tentacles begin
const JELLY_TENTACLE_PAD = JELLY_TENTACLE_AMP;

export async function makeJellyfishSprite(): Promise<string> {
  return bufToDataURL(jellyTentacleSheet(await cropAtlasCell(SEA_CREATURE_JELLYFISH_INDEX)));
}

// Sideways shift for column `x` at row `y`: zero in the bell, growing toward the
// tentacle tips, phase lagging with depth so the curtain undulates as it streams.
function jellyShift(y: number, h: number, f: number): number {
  if (y < h * JELLY_BELL_MARGIN) return 0;
  const lower = Math.min(1, (y - h * JELLY_BELL_MARGIN) / (h * (1 - JELLY_BELL_MARGIN)));
  const phase = (2 * Math.PI * f) / JELLYFISH_FRAMES;
  return Math.round(JELLY_TENTACLE_AMP * lower * Math.sin(phase - 2.4 * lower));
}

// Exported so the headless previewer can bake the same tentacle frames the app does.
export function jellyTentacleSheet(jelly: Buf): Buf {
  const fw = jelly.w + JELLY_TENTACLE_PAD * 2;
  const sheetW = fw * JELLYFISH_FRAMES;
  const data = new Uint8Array(sheetW * jelly.h * 4);

  for (let f = 0; f < JELLYFISH_FRAMES; f++) {
    const ox = f * fw;
    for (let y = 0; y < jelly.h; y++) {
      const shift = jellyShift(y, jelly.h, f);
      for (let x = 0; x < jelly.w; x++) {
        const si = (y * jelly.w + x) * 4;
        if (jelly.data[si + 3] === 0) continue;
        const dx = x + JELLY_TENTACLE_PAD + shift;
        if (dx < 0 || dx >= fw) continue;
        const di = (y * sheetW + ox + dx) * 4;
        data[di] = jelly.data[si];
        data[di + 1] = jelly.data[si + 1];
        data[di + 2] = jelly.data[si + 2];
        data[di + 3] = jelly.data[si + 3];
      }
    }
  }

  return { data, w: sheetW, h: jelly.h };
}

// =========================== ENTITY + ARMS ===========================
type ArmSet = {
  count: number;
  spread: number; // fan angle across all arms (radians) when relaxed
  len: number;
  seg: number;
  width: number;
  wave: number; // wiggle amplitude
  freq: number; // wiggle speed
  color: RGBA;
  // Octopus-style fan: `droop` is the base angle of the fan (π/2 = straight
  // down); `crownY` lowers the arm anchor to the front-lower body; `curl` coils
  // the tips; `suckers` dots a paler pixel along each arm.
  droop?: number;
  crownY?: number;
  curl?: number;
  suckers?: RGBA;
};

type KindCfg = {
  sprite: string;
  z: number;
  frontOff: number; // center → arm crown along the facing axis, in px
  refSpeed: number; // speed at which the arms fully streamline behind
  drag: number; // water resistance bleeding every glide
  level: { min: number; max: number }; // preferred vertical band (fractions)
  arms?: ArmSet; // procedural arms (octopus); absent for the atlas nautilus
  anim?: string; // sprite-sheet anim to loop (the nautilus/jellyfish atlas)
  motion: "jet" | "crawl" | "pulse";
  // jet kind (nautilus): arms-first cruise + tail-first pulse, weighted by bias.
  cruise?: number;
  segCruise?: [number, number];
  jet?: { interval: [number, number]; impulse: number; vert: number };
  segJet?: [number, number];
  armsBias?: number;
  // crawl kind (octopus): seek a roving target slowly + rare mantle-first jet.
  crawl?: {
    speed: number;
    roam: [number, number];
    jetChance: number;
    jetImpulse: number;
    jetDur: number;
  };
  // pulse kind (jellyfish): rhythmic bell-pump propulsion. Each cycle is
  // contraction (active power stroke, main thrust) → relaxation (elastic recoil,
  // a smaller "passive energy recapture" thrust) → interpulse (coast + slow sink).
  // The bell squashes vertically on the power stroke, synced to the thrust.
  pulse?: {
    contract: number; // power-stroke duration (s)
    relax: number; // elastic-recoil duration (s)
    coast: [number, number]; // interpulse pause range (s)
    thrust: number; // upward impulse at contraction
    per: number; // passive-recapture impulse at relaxation (fraction of thrust)
    sink: number; // negative buoyancy — slow drift down between pulses
    drift: number; // gentle sideways sway speed (weak horizontal control)
    squash: number; // bell scale.y at full contraction (≤ 1)
    roam: [number, number]; // how often it picks a new target depth (s)
  };
};

const KINDS: Record<string, KindCfg> = {
  octopus: {
    sprite: "octopus",
    z: 18,
    frontOff: 4 * S, // arm crown sits just forward of center
    refSpeed: 60 * S,
    drag: 2.2,
    level: { min: 0.62, max: 0.92 }, // benthic — hugs the lower tank
    motion: "crawl",
    crawl: {
      speed: 16 * S, // slow omnidirectional drift
      roam: [1.4, 3.0],
      jetChance: 0.18, // rare escape
      jetImpulse: 70 * S,
      jetDur: 0.6,
    },
    arms: {
      count: 8,
      spread: 2.4, // wide downward fan
      len: 15 * S,
      seg: 10,
      width: 1.8 * S,
      wave: 0.7,
      freq: 2.2,
      color: [120, 108, 132, 255],
      droop: Math.PI / 2,
      crownY: 7 * S,
      curl: 0.18,
      suckers: [223, 198, 150, 255],
    },
  },
  nautilus: {
    sprite: "nautilus",
    z: 16,
    frontOff: 7 * S, // unused (no procedural arms) but required by the shared config
    refSpeed: 18 * S,
    drag: 1.1,
    level: { min: 0.08, max: 0.78 },
    anim: "idle", // loop the 12-frame atlas; tentacles are baked in
    motion: "jet",
    cruise: 7 * S, // slow anterior-first amble
    segCruise: [5, 9],
    // Gentle, infrequent pulses — an efficient, unhurried posterior-first drifter.
    jet: { interval: [2.5, 4.5], impulse: 13 * S, vert: 0.12 },
    segJet: [5, 9],
    armsBias: 0.5, // equal mix of cruise and jet
  },
  jellyfish: {
    sprite: "jellyfish",
    z: 15,
    frontOff: 0, // unused (no procedural arms, no facing) but required by the config
    refSpeed: 40 * S, // scales tentacle-anim speed with bell activity
    drag: 1.6,
    level: { min: 0.05, max: 0.7 }, // drifts the mid/upper column
    anim: "idle", // loop the tentacle-sway frames; the bell pulse is a runtime squash
    motion: "pulse",
    pulse: {
      contract: 0.32, // quick active power stroke
      relax: 0.85, // slower elastic recoil
      coast: [0.5, 1.4], // pause and coast before the next pump
      thrust: 34 * S,
      per: 0.32, // passive energy recapture ≈ a third of the active push
      sink: 9 * S, // slowly settles between pulses
      drift: 5 * S, // barely steers sideways
      squash: 0.8,
      roam: [4, 8],
    },
  },
};

type Creature = {
  px: number;
  py: number;
  headDir: number; // facing: +1 right, -1 left
  speed: number;
  phase: number;
  cfg: KindCfg;
};

const creatures: Creature[] = [];

// One world-space layer draws every creature's arms (same pattern as the tank's
// caustics/plant layers). Add it once, before or after spawning — it reads the
// live creatures list each frame.
export function setupCephalopodArms(k: KAPLAYCtx) {
  k.add([
    k.pos(0, 0),
    k.z(17),
    {
      draw() {
        for (const c of creatures) drawArms(k, c);
      },
    },
  ]);
}

function drawArms(k: KAPLAYCtx, c: Creature) {
  const A = c.cfg.arms;
  if (!A) return; // the nautilus bakes its tentacles into the atlas frames
  const t = k.time();
  const speedN = Math.min(1, c.speed / c.cfg.refSpeed);

  // Arms fan downward from the front-lower arm crown and curl at the tips. As
  // the octopus jets they bunch (narrower spread) and swing back behind it.
  const ax = c.px + c.headDir * c.cfg.frontOff;
  const ay = c.py + (A.crownY ?? 0);
  const back = c.headDir > 0 ? 0 : Math.PI; // toward the front (arms trail here)
  const droop = A.droop ?? Math.PI / 2;
  const baseAng = droop + (back - droop) * speedN;
  const spread = A.spread * (1 - 0.5 * speedN);
  const wave = A.wave * (1 - 0.3 * speedN);
  for (let i = 0; i < A.count; i++) {
    const f = A.count > 1 ? i / (A.count - 1) - 0.5 : 0;
    const curl = (A.curl ?? 0) * (i % 2 === 0 ? 1 : -1); // alternate coil dir
    drawTentacle(k, ax, ay, baseAng + f * spread, A.len, A.seg, A.width, wave,
      A.freq, c.phase + i * 1.7, A.color, t, curl, A.suckers);
  }
}

function drawTentacle(
  k: KAPLAYCtx,
  ax: number,
  ay: number,
  baseAng: number,
  len: number,
  seg: number,
  width: number,
  wave: number,
  freq: number,
  phase: number,
  color: RGBA,
  t: number,
  curl: number,
  suckers: RGBA | undefined,
) {
  const segLen = len / seg;
  const col = k.rgb(color[0], color[1], color[2]);
  const sc = suckers ? k.rgb(suckers[0], suckers[1], suckers[2]) : null;
  let x = ax;
  let y = ay;
  let ang = baseAng;
  for (let s = 1; s <= seg; s++) {
    const u = s / seg;
    ang += Math.sin(t * freq + phase + s * 0.6) * wave * 0.12 * u;
    ang += curl * (0.4 + u); // steady curl, tighter toward the tip
    x += Math.cos(ang) * segLen;
    y += Math.sin(ang) * segLen;
    const wHalf = Math.max(0.5 * S, width * (1 - u * 0.8));
    k.drawRect({
      pos: k.vec2(Math.round(x), Math.round(y)),
      width: wHalf * 2,
      height: wHalf * 2,
      anchor: "center",
      color: col,
      opacity: color[3] / 255,
    });
    if (sc && s % 2 === 0 && u < 0.85) {
      k.drawRect({
        pos: k.vec2(Math.round(x), Math.round(y)),
        width: 1 * S,
        height: 1 * S,
        anchor: "center",
        color: sc,
        opacity: 0.9,
      });
    }
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const TILT_STEP = 7;

export function spawnCephalopod(k: KAPLAYCtx, kindName: keyof typeof KINDS) {
  const cfg = KINDS[kindName];
  const minY = 24 * S;
  const maxY = () => k.height() * 0.78;
  const bandTop = () => minY + (maxY() - minY) * cfg.level.min;
  const bandBot = () => minY + (maxY() - minY) * cfg.level.max;

  const body = k.add([
    k.sprite(cfg.sprite),
    k.pos(k.rand(60 * S, k.width() - 60 * S), k.rand(bandTop(), bandBot())),
    k.anchor("center"),
    k.rotate(0),
    k.scale(1),
    k.z(cfg.z),
  ]);

  const creature: Creature = {
    px: body.pos.x,
    py: body.pos.y,
    headDir: 1,
    speed: 0,
    phase: k.rand(0, Math.PI * 2),
    cfg,
  };
  creatures.push(creature);

  let vx = 0;
  let vy = 0;
  let px = creature.px;
  let py = creature.py;
  let ang = 0;
  let facing = k.choose([-1, 1]); // head/eye direction

  // jet-kind (nautilus) state
  let heading = facing;
  let mode: "cruise" | "jet" = "cruise";
  let depth = py;
  let segTimer = k.rand(cfg.segCruise?.[0] ?? 3, cfg.segCruise?.[1] ?? 6);
  let jetTimer = 0;

  // crawl-kind (octopus) state
  let tx = px;
  let ty = py;
  let roamTimer = 0;
  let jetT = 0;

  // pulse-kind (jellyfish) state: a 3-phase bell-pump cycle and the live bell
  // squash it drives.
  let pulsePhase: 0 | 1 | 2 = 2; // 0 contract, 1 relax, 2 coast
  let pulseTimer = k.rand(cfg.pulse?.coast[0] ?? 0.5, cfg.pulse?.coast[1] ?? 1.4);
  let bellSquash = 1; // current scale.y (≤ 1; 1 = relaxed bell)

  body.flipX = facing > 0;
  if (cfg.anim) body.play(cfg.anim); // loop the atlas animation (nautilus)

  const beginTurn = (nf: number) => {
    if (nf === facing) return;
    facing = nf;
    body.flipX = facing > 0;
  };

  // Nautilus: start a new arms-first cruise or tail-first jet segment. Heading
  // biases toward center to roam; arms-first leads with the head (facing =
  // travel), tail-first leads with the body (facing = opposite) — a facing flip
  // triggers a smooth turnaround.
  const startSegment = () => {
    const arms = k.chance(cfg.armsBias ?? 0.5);
    mode = arms ? "cruise" : "jet";
    heading =
      px < k.width() / 2 ? (k.chance(0.8) ? 1 : -1) : k.chance(0.8) ? -1 : 1;
    if (k.chance(0.5)) depth = k.rand(bandTop(), bandBot());
    segTimer = arms
      ? k.rand(cfg.segCruise![0], cfg.segCruise![1])
      : k.rand(cfg.segJet![0], cfg.segJet![1]);
    jetTimer = 0;
    beginTurn(arms ? heading : -heading);
  };

  body.onUpdate(() => {
    const dt = k.dt();
    const drag = cfg.drag;
    const mX = 40 * S;

    if (cfg.motion === "crawl") {
      // OCTOPUS: ease velocity toward a slowly-roving target (any direction —
      // orientation stays put), repicking the target on a timer; occasionally
      // fire a brief mantle-first (backward) jet escape.
      const cr = cfg.crawl!;
      roamTimer -= dt;
      if (roamTimer <= 0) {
        roamTimer = k.rand(cr.roam[0], cr.roam[1]);
        tx = k.rand(mX, k.width() - mX);
        ty = k.rand(bandTop(), bandBot());
        if (k.chance(0.4)) beginTurn(tx > px ? 1 : -1);
        if (k.chance(cr.jetChance)) {
          jetT = cr.jetDur;
          vx += -facing * cr.jetImpulse; // mantle is the rear → jet goes backward
          vy += -cr.jetImpulse * 0.3; // and a little up
        }
      }
      if (jetT > 0) {
        jetT -= dt; // coast through the jet; arms sweep back via speedN
      } else {
        const dx = tx - px;
        const dy = ty - py;
        const d = Math.hypot(dx, dy) || 1;
        const sp = cr.speed * Math.min(1, d / (12 * S)); // ease off near the target
        vx += ((dx / d) * sp - vx) * 4 * dt;
        vy += ((dy / d) * sp - vy) * 4 * dt;
      }
    } else if (cfg.motion === "pulse") {
      // JELLYFISH: a rhythmic bell-pump. Each cycle is contraction (main upward
      // thrust) → relaxation (a smaller passive-recapture thrust) → coast. Between
      // pulses it sinks slowly (negative buoyancy); the bell squash tracks the
      // phase so the pump you see is the push that moves it.
      const p = cfg.pulse!;
      // How much it still needs to climb toward its target depth: 1 = well below
      // (pulse up hard), 0 = at or above it (no lift — just hover and sink). This
      // gates the thrust so the jelly bobs around its depth instead of pulsing
      // against the surface, the way a real medusa coasts once it's high enough.
      const climb = clamp((py - depth) / (40 * S), 0, 1);

      roamTimer -= dt;
      if (roamTimer <= 0) {
        roamTimer = k.rand(p.roam[0], p.roam[1]);
        depth = k.rand(bandTop(), bandBot()); // roam the column
      }

      pulseTimer -= dt;
      if (pulseTimer <= 0) {
        if (pulsePhase === 2) {
          pulsePhase = 0; // coast → contract: the active power stroke
          pulseTimer = p.contract;
          vy -= p.thrust * climb; // only push up as much as it needs to climb
          vx += k.rand(-1, 1) * p.drift; // a little lateral wander each stroke
        } else if (pulsePhase === 0) {
          pulsePhase = 1; // contract → relax: the free passive-recapture push
          pulseTimer = p.relax;
          vy -= p.thrust * p.per * climb;
        } else {
          pulsePhase = 2; // relax → coast — rest longer when it isn't climbing
          pulseTimer = k.rand(p.coast[0], p.coast[1]) * (1.6 - climb);
        }
      }

      // Squash fast on the power stroke, ease back over the relaxation/coast. The
      // stroke softens when it isn't climbing, so a hovering jelly only breathes.
      const target =
        pulsePhase === 0 ? 1 - (1 - p.squash) * Math.max(0.3, climb) : 1;
      const rate = pulsePhase === 0 ? 18 : 6;
      bellSquash += (target - bellSquash) * (1 - Math.exp(-rate * dt));

      vy += p.sink * dt; // always sinking a touch; the pulses fight it
      vx += Math.sign(k.width() / 2 - px) * p.drift * 0.3 * dt; // bias off the walls
    } else {
      // NAUTILUS: arms-first cruise / tail-first pulse machine.
      segTimer -= dt;
      if (segTimer <= 0) startSegment();
      if (mode === "cruise") {
        vx += heading * cfg.cruise! * drag * dt; // equilibrium ≈ cruise
      } else {
        jetTimer -= dt;
        if (jetTimer <= 0) {
          jetTimer = k.rand(cfg.jet!.interval[0], cfg.jet!.interval[1]);
          vx += heading * cfg.jet!.impulse;
          const v = cfg.jet!.impulse * cfg.jet!.vert;
          vy += clamp((depth - py) * 1.5, -v, v);
        }
      }
      vy += clamp((depth - py) * 0.8, -14 * S, 14 * S) * dt;
    }

    vx -= vx * drag * dt;
    vy -= vy * drag * dt;
    px += vx * dt;
    py += vy * dt;
    py = clamp(py, minY, maxY());

    // Keep inside the tank; the jet kind retargets a fresh inward segment on
    // contact, the crawl kind just clamps (its roam target steers it back).
    if (px < mX) {
      px = mX;
      if (vx < 0) vx = 0;
      if (cfg.motion === "jet") segTimer = 0;
    } else if (px > k.width() - mX) {
      px = k.width() - mX;
      if (vx > 0) vx = 0;
      if (cfg.motion === "jet") segTimer = 0;
    }

    // The jellyfish stays upright (radially symmetric); the others pitch into
    // their travel slope.
    const travelDir = vx >= 0 ? 1 : -1;
    const slope =
      cfg.motion === "pulse"
        ? 0
        : clamp(Math.atan2(vy, Math.abs(vx) + 10 * S), -0.3, 0.3);
    const targetPitch = ((travelDir > 0 ? slope : -slope) * 180) / Math.PI;
    ang += (targetPitch - ang) * (1 - Math.exp(-6 * dt));

    body.pos.x = Math.round(px);
    body.pos.y = Math.round(py);
    body.angle = Math.round(ang / TILT_STEP) * TILT_STEP;
    if (cfg.motion === "pulse") body.scale.y = bellSquash; // the bell pump

    creature.px = px;
    creature.py = py;
    creature.headDir = facing;
    creature.speed = Math.hypot(vx, vy);
    if (cfg.anim) {
      const speedN = Math.min(1, creature.speed / cfg.refSpeed);
      // The jellyfish tentacles sway gently and quicken just after a pulse; the
      // nautilus anim ramps harder with speed.
      body.animSpeed =
        cfg.motion === "pulse" ? 1 + speedN * 4 : 0.5 + speedN * 9.5;
    }
  });

  return body;
}
