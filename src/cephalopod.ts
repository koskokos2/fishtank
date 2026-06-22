// Cephalopods: a second creature type alongside the fish. One entity, two kinds
// (octopus, nautilus) — the same split the fish use for species. Each kind has a
// rigid BODY baked to a sprite via the shared pixel/shading pipeline (so the art
// matches the fish), plus ARMS that are NOT baked: a central draw layer renders
// them per frame as tapering, waving curves in world space (the "moving legs").
//
// The octopus body is procedural (baked here); the nautilus body is a realistic
// 12-frame animation atlas (see nautilusAtlas.ts) smooth-downscaled to fish size
// at load — the one exception to the procedural-sprites convention. The octopus
// keeps per-frame procedural arms; the nautilus's tentacles are baked into its
// atlas frames, so it carries no arm config.
//
// Motion differs by nature (see the per-kind config):
//  - Octopus: mostly slow, irregular, omnidirectional crawl-drift low in the
//    tank (orientation decoupled from travel), with rare fast mantle-first jets.
//  - Nautilus: pulsatile jet — posterior-first (body leading) most of the time,
//    occasional anterior-first amble, with a squash-flip turnaround.

import type { KAPLAYCtx } from "kaplay";
import { type RGBA } from "./color";
import { type FishColor, rampFor, shade, selectiveOutline } from "./pixels";
import { NAUTILUS_ATLAS, NAUTILUS_FRAMES } from "./nautilusAtlas";

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
export const OCTO_W = 32;
export const OCTO_H = 28;
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

  ell(19, 10, 10, 9, BODY); // mantle dome (upper, rear-right), egg-tall
  ell(12, 17, 8, 6, BODY); // head (lower-left, the front)

  // Big amber eye on the head, looking left: dark pupil ringed in gold + a glint.
  ell(8, 17, 3, 3, RING);
  for (let y = 16; y <= 17; y++) for (let x = 7; x <= 8; x++) code[y * W + x] = PUPIL;
  code[16 * W + 7] = GLINT;

  const ramp = rampFor(OCTO_BASE);
  const buf: RGBA[] = code.map((c, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    // Top-lit so the mantle dome reads round.
    const L = Math.max(0, Math.min(1, 0.9 - ((y - 2) / (H - 4)) * 0.62));
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
// A realistic 12-frame atlas (nautilusAtlas.ts), not procedural. The frames are
// 128px — ~4x the tank's pixel density — so they're smooth-downscaled once at
// load onto a 2D canvas (area resampling, NOT the global nearest-neighbor filter
// which would alias), yielding a fish-sized sprite sheet drawn at scale 1. The
// tentacle wave is baked into the frames, so the nautilus needs no arm config.
export const NAUT_FRAME = 36; // on-screen frame size (px); ~fish-sized

export function makeNautilusSprite(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const src = img.width / NAUTILUS_FRAMES; // 128
      const canvas = document.createElement("canvas");
      canvas.width = NAUT_FRAME * NAUTILUS_FRAMES;
      canvas.height = NAUT_FRAME;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (let i = 0; i < NAUTILUS_FRAMES; i++)
        ctx.drawImage(img, i * src, 0, src, img.height,
          i * NAUT_FRAME, 0, NAUT_FRAME, NAUT_FRAME);
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = NAUTILUS_ATLAS;
  });
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
  anim?: string; // sprite-sheet anim to loop (the nautilus atlas)
  motion: "jet" | "crawl";
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
};

const KINDS: Record<string, KindCfg> = {
  octopus: {
    sprite: "octopus",
    z: 18,
    frontOff: 4, // arm crown sits just forward of center
    refSpeed: 60,
    drag: 2.2,
    level: { min: 0.62, max: 0.92 }, // benthic — hugs the lower tank
    motion: "crawl",
    crawl: {
      speed: 16, // slow omnidirectional drift
      roam: [1.4, 3.0],
      jetChance: 0.18, // rare escape
      jetImpulse: 70,
      jetDur: 0.6,
    },
    arms: {
      count: 8,
      spread: 2.4, // wide downward fan
      len: 15,
      seg: 10,
      width: 1.8,
      wave: 0.7,
      freq: 2.2,
      color: [120, 108, 132, 255],
      droop: Math.PI / 2,
      crownY: 7,
      curl: 0.18,
      suckers: [223, 198, 150, 255],
    },
  },
  nautilus: {
    sprite: "nautilus",
    z: 16,
    frontOff: 7, // unused (no procedural arms) but required by the shared config
    refSpeed: 18,
    drag: 1.1,
    level: { min: 0.08, max: 0.78 },
    anim: "idle", // loop the 12-frame atlas; tentacles are baked in
    motion: "jet",
    cruise: 7, // rare, slow anterior-first amble
    segCruise: [3.5, 6.5],
    // Slow, infrequent pulses — an efficient, unhurried posterior-first drifter.
    jet: { interval: [1.4, 2.6], impulse: 18, vert: 0.2 },
    segJet: [3, 6],
    armsBias: 0.3, // predominantly posterior-first (body leading)
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
    const wHalf = Math.max(0.5, width * (1 - u * 0.8));
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
        width: 1,
        height: 1,
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
  const minY = 24;
  const maxY = () => k.height() * 0.78;
  const bandTop = () => minY + (maxY() - minY) * cfg.level.min;
  const bandBot = () => minY + (maxY() - minY) * cfg.level.max;

  const body = k.add([
    k.sprite(cfg.sprite),
    k.pos(k.rand(60, k.width() - 60), k.rand(bandTop(), bandBot())),
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

  const TURN_DUR = 0.4; // seconds of squash-flip when reorienting
  let vx = 0;
  let vy = 0;
  let px = creature.px;
  let py = creature.py;
  let ang = 0;
  let facing = k.choose([-1, 1]); // head/eye direction
  // Smooth turnaround: a brief X-squash that flips `facing` at its midpoint, so
  // the sprite reads as pivoting in place instead of mirror-snapping.
  let turning = false;
  let turnT = 0;
  let pendingFacing = facing;
  let flipped = false;

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

  body.flipX = facing > 0;
  if (cfg.anim) body.play(cfg.anim); // loop the atlas animation (nautilus)

  const beginTurn = (nf: number) => {
    if (nf === facing) return;
    turning = true;
    turnT = 0;
    pendingFacing = nf;
    flipped = false;
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
    const mX = 40;

    if (turning) {
      // Glide through the pivot; flip the facing as the squash crosses zero.
      turnT += dt;
      const p = Math.min(1, turnT / TURN_DUR);
      body.scale.x = Math.max(0.06, Math.abs(1 - 2 * p));
      if (p >= 0.5 && !flipped) {
        facing = pendingFacing;
        body.flipX = facing > 0;
        flipped = true;
      }
      if (turnT >= TURN_DUR) {
        turning = false;
        body.scale.x = 1;
      }
    } else if (cfg.motion === "crawl") {
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
        const sp = cr.speed * Math.min(1, d / 12); // ease off near the target
        vx += ((dx / d) * sp - vx) * 4 * dt;
        vy += ((dy / d) * sp - vy) * 4 * dt;
      }
    } else {
      // NAUTILUS: arms-first cruise / tail-first pulse machine.
      segTimer -= dt;
      if (segTimer <= 0) startSegment();
      if (!turning) {
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
        vy += clamp((depth - py) * 0.8, -14, 14) * dt;
      }
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
      if (!turning && cfg.motion === "jet") segTimer = 0;
    } else if (px > k.width() - mX) {
      px = k.width() - mX;
      if (vx > 0) vx = 0;
      if (!turning && cfg.motion === "jet") segTimer = 0;
    }

    const slope = clamp(Math.atan2(vy, Math.abs(vx) + 10), -0.3, 0.3);
    const targetPitch = ((facing > 0 ? slope : -slope) * 180) / Math.PI;
    ang += (targetPitch - ang) * (1 - Math.exp(-6 * dt));

    body.pos.x = Math.round(px);
    body.pos.y = Math.round(py);
    body.angle = Math.round(ang / TILT_STEP) * TILT_STEP;

    creature.px = px;
    creature.py = py;
    creature.headDir = facing;
    creature.speed = Math.hypot(vx, vy);
  });

  return body;
}
