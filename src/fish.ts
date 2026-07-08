import type { GameObj, KAPLAYCtx } from "kaplay";
import {
  FISH_ATLAS,
  FISH_ATLAS_CELL,
  FISH_ATLAS_LAYOUT,
} from "./fishAtlas";
import {
  FISH_EXTRA_ATLAS,
  FISH_EXTRA_ATLAS_CELL,
  FISH_EXTRA_ATLAS_LAYOUT,
} from "./fishExtraAtlas";
import {
  FISH_BONUS_ATLAS,
  FISH_BONUS_ATLAS_CELL,
  FISH_BONUS_ATLAS_LAYOUT,
} from "./fishBonusAtlas";
import {
  cellBBox,
  copyRect,
  motionBeatScale,
  shearSheet,
  type FishMotionProfile,
} from "./fishbake";
import { groundZ, sandTopAt } from "./backdrop";
import { spawnSandPuff } from "./sandPuff";
import { spawnBubble } from "./tank";
import { RES } from "./res";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export type FishKind = {
  name: string;
  level: { min: number; max: number };
  speed: number; // multiplier on thrust and initial velocity (1.0 = baseline)
  length: number; // typical adult body length (cm) — drives on-screen size
  motion: FishMotionProfile;
};

// Names must match one of the three atlas layouts. Every fish faces left.
// `level` is the species' preferred vertical band as fractions of the swimmable
// height (0 = surface, 1 = floor), taken from its real-life habitat.
// `speed` is grounded in real swimming-performance data (body-lengths/sec tiers).
// `length` is the typical adult size in cm; rendered size grows with sqrt(length).
export const FISH_KINDS: FishKind[] = [
  // --- main atlas ---
  { name: "angelfish",              level: { min: 0.10, max: 0.42 }, speed: 0.70, length: 15,  motion: "flowing" }, // slow  — deep laterally-flat body
  { name: "red_tailed_black_shark", level: { min: 0.72, max: 0.97 }, speed: 1.25, length: 12,  motion: "standard" }, // fast  — burst charges when territorial
  { name: "discus",                 level: { min: 0.28, max: 0.58 }, speed: 0.60, length: 20,  motion: "paddle" }, // slow  — nearly sedentary, prefers still water
  { name: "guppy",                  level: { min: 0.02, max: 0.26 }, speed: 0.85, length: 4,   motion: "flowing" }, // med   — burst-escape specialist, large tail
  { name: "goldfish",               level: { min: 0.22, max: 0.62 }, speed: 1.15, length: 20,  motion: "flowing" }, // fast  — sustained cruiser, multiple speed modes
  { name: "tiger_barb",             level: { min: 0.68, max: 0.96 }, speed: 1.00, length: 7,   motion: "standard" }, // med   — variable; rest-then-dash rhythm
  { name: "lionhead_cichlid",       level: { min: 0.52, max: 0.86 }, speed: 1.30, length: 11,  motion: "standard" }, // fast  — open-water hunter, uses full tank
  { name: "neon_tetra",             level: { min: 0.06, max: 0.34 }, speed: 0.80, length: 3,   motion: "standard" }, // slow  — schooling fish, slow-current habitat
  { name: "labidochromis_caeruleus",level: { min: 0.58, max: 0.92 }, speed: 1.00, length: 10,  motion: "standard" }, // med   — active forager, typical cichlid pace
  { name: "royal_pleco",            level: { min: 0.44, max: 0.76 }, speed: 1.35, length: 43,  motion: "paddle" }, // fast  — energetic darter, rapid direction changes
  { name: "gourami",                level: { min: 0.20, max: 0.52 }, speed: 1.20, length: 12,  motion: "flowing" }, // fast  — strong swimmer, adapted to fast currents
  { name: "koi",                    level: { min: 0.02, max: 0.28 }, speed: 1.40, length: 60,  motion: "standard" }, // fast  — largest body, powerful burst-and-coast
  // --- extra atlas ---
  { name: "betta",                  level: { min: 0.15, max: 0.50 }, speed: 0.65, length: 6,   motion: "flowing" }, // slow  — long flowing fins, prefers still midwater
  { name: "corydoras",              level: { min: 0.72, max: 0.95 }, speed: 0.75, length: 6,   motion: "paddle" }, // slow  — benthic schooler, scavenging bottom trot
  { name: "kuhli_loach",            level: { min: 0.80, max: 0.98 }, speed: 0.55, length: 10,  motion: "eel" }, // slow  — eel-like bottom creep
  { name: "hatchetfish",            level: { min: 0.00, max: 0.15 }, speed: 1.10, length: 4,   motion: "standard" }, // fast  — surface skimmer, burst-capable
  { name: "zebra_danio",            level: { min: 0.05, max: 0.35 }, speed: 1.30, length: 5,   motion: "standard" }, // fast  — high-energy schooler
  { name: "harlequin_rasbora",      level: { min: 0.08, max: 0.38 }, speed: 0.90, length: 4.5, motion: "standard" }, // med   — compact mid-upper schooler
  { name: "ram_cichlid",            level: { min: 0.48, max: 0.78 }, speed: 1.00, length: 6,   motion: "flowing" }, // med   — active small cichlid, mid-low
  { name: "black_molly",            level: { min: 0.18, max: 0.62 }, speed: 0.95, length: 8,   motion: "standard" }, // med   — livebearer, wide mid-range
  { name: "rainbowfish",            level: { min: 0.18, max: 0.55 }, speed: 1.20, length: 11,  motion: "standard" }, // fast  — strong cruiser, iridescent midwater
  { name: "glass_catfish",          level: { min: 0.28, max: 0.62 }, speed: 0.70, length: 12,  motion: "eel" }, // slow  — drifting, nearly transparent
  { name: "otocinclus",             level: { min: 0.62, max: 0.92 }, speed: 0.80, length: 4,   motion: "paddle" }, // slow  — tiny grazer, lower half
  { name: "clown_loach",            level: { min: 0.68, max: 0.95 }, speed: 1.05, length: 25,  motion: "standard" }, // med   — striped bottom cruiser
  // --- bonus reef atlas ---
  { name: "ocellaris_clownfish",    level: { min: 0.22, max: 0.58 }, speed: 0.85, length: 9,   motion: "standard" }, // med   — compact, agile reef swimmer
  { name: "blue_tang",              level: { min: 0.14, max: 0.55 }, speed: 1.25, length: 30,  motion: "standard" }, // fast  — active open-reef cruiser
  { name: "yellow_tang",            level: { min: 0.18, max: 0.58 }, speed: 1.15, length: 20,  motion: "standard" }, // fast  — steady midwater grazer
  { name: "moorish_idol",           level: { min: 0.12, max: 0.52 }, speed: 0.90, length: 22,  motion: "flowing" }, // med   — tall profile with trailing banner fin
  { name: "lionfish",               level: { min: 0.38, max: 0.82 }, speed: 0.55, length: 35,  motion: "flowing" }, // slow  — hovering ambush hunter with broad fins
  { name: "porcupine_puffer",       level: { min: 0.25, max: 0.68 }, speed: 0.65, length: 40,  motion: "paddle" }, // slow  — rounded body propelled by small fins
  { name: "royal_gramma",           level: { min: 0.38, max: 0.76 }, speed: 0.85, length: 8,   motion: "standard" }, // med   — small cave-edge reef fish
  { name: "mandarin_dragonet",      level: { min: 0.68, max: 0.94 }, speed: 0.50, length: 7,   motion: "paddle" }, // slow  — ornate bottom-hugging hoverer
  { name: "firefish_goby",          level: { min: 0.12, max: 0.46 }, speed: 1.15, length: 8,   motion: "standard" }, // fast  — hovering fish with sharp retreat bursts
  { name: "copperband_butterflyfish",level: { min: 0.20, max: 0.62 }, speed: 0.75, length: 20,  motion: "paddle" }, // slow  — precise tall-bodied reef picker
  { name: "arctic_peeper",          level: { min: 0.10, max: 0.55 }, speed: 1.30, length: 14,  motion: "flowing" }, // fast  — alien cruiser with flexible trailing fins
  { name: "foxface_rabbitfish",     level: { min: 0.22, max: 0.66 }, speed: 1.10, length: 24,  motion: "standard" }, // fast  — active reef grazer
];

// Bake one swim sheet per fish: copy each atlas cell's tight crop at native
// pixel-art resolution, then synthesize a species-profiled swim (see fishbake.ts).
// Returns a data URL per FISH_KINDS entry, in order. Async because atlas images
// decode off-thread; await before registering sprites so the load queue is complete.
export async function makeFishSheets(): Promise<string[]> {
  const [img1, img2, img3] = await Promise.all([
    loadImage(FISH_ATLAS),
    loadImage(FISH_EXTRA_ATLAS),
    loadImage(FISH_BONUS_ATLAS),
  ]);

  const toPixels = (img: HTMLImageElement) => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext("2d")!;
    cx.drawImage(img, 0, 0);
    return {
      full: new Uint8Array(cx.getImageData(0, 0, img.width, img.height).data.buffer),
      width: img.width,
    };
  };

  const a1 = toPixels(img1);
  const a2 = toPixels(img2);
  const a3 = toPixels(img3);

  return FISH_KINDS.map((kind) => {
    const inExtra = kind.name in FISH_EXTRA_ATLAS_LAYOUT;
    const inBonus = kind.name in FISH_BONUS_ATLAS_LAYOUT;
    const { full, width } = inBonus ? a3 : inExtra ? a2 : a1;
    const cell = inBonus
      ? FISH_BONUS_ATLAS_CELL
      : inExtra
        ? FISH_EXTRA_ATLAS_CELL
        : FISH_ATLAS_CELL;
    const { row, col } = inBonus
      ? FISH_BONUS_ATLAS_LAYOUT[kind.name]
      : inExtra
        ? FISH_EXTRA_ATLAS_LAYOUT[kind.name]
        : FISH_ATLAS_LAYOUT[kind.name];
    const bb = cellBBox(full, width, col * cell, row * cell, cell);
    const fish = copyRect(full, width, bb.x, bb.y, bb.bw, bb.bh);
    return bufToDataURL(shearSheet(fish, kind.motion));
  });
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

// Motion model grounded in fish-swimming kinematics:
//  - Burst-and-coast gait: fish thrust in bursts, then glide with a still body
//    while drag bleeds off speed. They never hold a constant cruise.
//  - Tail-beat frequency tracks speed (amplitude is ~constant), so the fin
//    animation speeds up under thrust and nearly stops while coasting.
//  - The rigid body pitches toward its travel direction — nose up rising, down
//    diving — and turns emerge from decelerating and reversing, never snapping.
// Speeds, accelerations and spacing are in px (/s) so they scale with RES; decay
// rates, angles and the per-frame share are unitless and stay fixed.
const ACCEL = 66 * RES; // forward thrust during a burst (px/s^2)
const DRAG = 1.1; // horizontal water resistance (per second)
const VDRAG = 1.4; // vertical water resistance
const VMAX = 26 * RES; // cap on vertical speed (keeps pitch gentle)
const MAX_TILT = (22 * Math.PI) / 180;
// Pitch snaps to multiples of this (degrees) so a tilted sprite holds a fixed
// rotation between steps instead of resampling — and rotating pixels — every frame.
const TILT_STEP = 7;
const AVOID = 520 * RES; // separation acceleration; grows as fish get closer
const AVOID_MAX = 150 * RES; // cap so a deep overlap can't fling a fish across the tank
// On-screen size tracks each species' real adult length, compressed by a square
// root so true ratios stay watchable — the 60cm koi renders ~1.4x the 3cm neon
// tetra instead of 20x. Scale divides the target length by the sprite's own
// cropped width and is capped at 1 so texels never grow coarser than the scene
// grid; the MIN_SCALE floor keeps the smallest species readable, so both ends
// of the range are clamped.
const LEN_PER_SQRT_CM = 8 * RES; // rendered body length (px) per sqrt(cm)
const MIN_SCALE = 0.72; // floor so the smallest species stay readable
const BODY_OFF_FRAC = 0.25; // head/tail separation points, as a share of rendered length
const PAIR_DIST = 12 * RES; // min spacing kept between any two body points
const SEPARATION = 0.25; // share of the overlap each fish resolves per frame

// Occasional ambient actions: now and then a fish breaks its burst/coast routine
// for a short, self-contained behaviour (nose the sand, gulp at the surface, dart,
// hover, rest on the bottom, chase a slower neighbour who darts away), then
// returns to normal swimming.
// ACTION_EVERY is the per-fish gap between actions (seconds, unitless — wall-clock).
const ACTION_EVERY: [number, number] = [20, 60];
const NOSE_GAP = 10 * RES; // body-centre height above the sand when nosing/resting
const DART_IMPULSE = 230 * RES; // one-shot startle kick (several times a normal burst)
const CHASE_RANGE = 180 * RES; // a chase only starts if a slower fish is within this
const CHASE_GIVEUP = CHASE_RANGE * 1.3; // pursuit breaks off once the target escapes this far
const CHASE_ACCEL = 1.7; // thrust multiplier while chasing (tail-beat follows the speed)
// A chased fish reacts in a ramp, not a point-blank bounce: it starts pulling away
// once the pursuer is inside FLEE_ALERT, its thrust growing toward FLEE_ACCEL as
// the gap closes, and only a point-blank FLEE_DART gap triggers the hard dart kick
// — by then it is already moving away, so the kick reads as a burst, not a bounce.
const FLEE_ALERT = 110 * RES; // distance where a chased fish starts easing away
const FLEE_DART = 30 * RES; // point-blank gap that climaxes in a dart kick
const FLEE_ACCEL = 2.4; // peak flee thrust multiplier at point-blank
const BENTHIC_MAX = 0.92; // species with level.max at/above this rest on the bottom

type FishAction =
  | "none"
  | "sift"
  | "gulp"
  | "dart"
  | "hover"
  | "rest"
  | "chase"
  | "flee";

export function spawnFish(
  k: KAPLAYCtx,
  spriteName: string,
  kind: Pick<FishKind, "level" | "speed" | "length" | "motion"> = {
    level: { min: 0.1, max: 0.9 },
    speed: 1,
    length: 10,
    motion: "standard",
  },
  opts: { enterFromEdge?: boolean; onGone?: () => void } = {},
) {
  const { level, speed: sp, motion } = kind;
  const minY = 16 * RES;
  const maxY = () => k.height() * 0.8;
  // Map the species' preferred band (fractions of the swimmable height) to pixel
  // Y bounds, so spawning and the swim target favor that level. A little inset
  // keeps fish off the exact band edges.
  const bandTop = () => minY + (maxY() - minY) * level.min;
  const bandBot = () => minY + (maxY() - minY) * level.max;

  const spawnY = k.rand(bandTop(), bandBot());
  const fish = k.add([
    k.sprite(spriteName),
    k.pos(k.rand(40 * RES, k.width() - 40 * RES), spawnY),
    k.anchor("center"),
    k.rotate(0),
    k.scale(1),
    k.z(groundZ(spawnY)),
    // Enlarged collider acts as a proximity sensor for separation, not a hard
    // hitbox — fish steer away before they actually touch.
    k.area({ scale: 1.5 }),
    // Head/tail world points, published each frame for capsule-style separation;
    // kindSpeed and menace() let a chaser pick catchable targets and press them.
    {
      headX: 0,
      headY: 0,
      tailX: 0,
      tailY: 0,
      kindSpeed: sp,
      menace(_fromX: number, _fromY: number) {},
    },
    "fish",
  ]);
  fish.play("swim", { loop: true });

  // The sheet frame width is the fish's tight crop, so the species scale can only
  // be resolved here, once the sprite is attached and measurable.
  const size = clamp(
    (LEN_PER_SQRT_CM * Math.sqrt(kind.length)) / fish.width,
    MIN_SCALE,
    1,
  );
  fish.scale = k.vec2(size);
  const renderedLen = fish.width * size;
  const bodyOff = renderedLen * BODY_OFF_FRAC;

  // Fully-offscreen threshold: half the sprite plus a small pad past the edge.
  const pad = renderedLen / 2 + 2 * RES;
  const fromLeft = k.chance(0.5);
  if (opts.enterFromEdge) {
    fish.pos.x = fromLeft ? -pad : k.width() + pad;
  }

  const dir0 = opts.enterFromEdge ? (fromLeft ? 1 : -1) : k.choose([-1, 1]);
  let vx = dir0 * 24 * RES * sp;
  let vy = 0;
  let heading = Math.sign(vx); // intended horizontal travel direction
  let facingRight = vx > 0;
  // True sub-pixel position kept in floats; fish.pos is snapped to whole pixels
  // for rendering so the sprite doesn't crawl/shimmer as it drifts slowly.
  let px = fish.pos.x;
  let py = fish.pos.y;
  let depth = py;
  let ang = 0;
  let phase: "burst" | "coast" = "burst";
  let timer = k.rand(0.3, 0.8);
  let beat = 3;

  // Occasional-action state: most of the time `action` is "none" and the routine
  // above runs; otherwise the action layer drives `depth`/`heading`/`phase` for a
  // few seconds, then hands back. `benthic` species (bottom band) can rest on the
  // sand; surface-reaching species can gulp; bottom-reaching species sift.
  let action: FishAction = "none";
  let actSub = "";
  let actTimer = 0;
  let siftPuffTimer = 0; // jittered cadence for the puffs trailed while surfing the sand
  let actCooldown = k.rand(ACTION_EVERY[0], ACTION_EVERY[1]);
  let chaseTarget: GameObj | null = null;
  // Flee state: where the pursuer last was, how long that sighting stays fresh,
  // and the current 0..1 urgency that scales the escape thrust.
  let threatX = 0;
  let threatY = 0;
  let threatFor = 0;
  let fleeUrgency = 0;
  const benthic = level.max >= BENTHIC_MAX;
  const canSift = level.max >= 0.5; // band reaches low enough to nose the sand
  const canGulp = level.min <= 0.4; // band reaches high enough to gulp at the top
  const inBand = () => k.rand(bandTop(), bandBot());

  // The pursuer publishes its position every chase frame. The sighting stays
  // fresh briefly; once the threat is inside FLEE_ALERT the target breaks what
  // it's doing and eases into a flee — the graded urgency (and the point-blank
  // dart) live in the flee action itself.
  fish.menace = (fromX: number, fromY: number) => {
    threatX = fromX;
    threatY = fromY;
    threatFor = 0.4;
    if (action === "flee" || action === "dart") return;
    if (Math.hypot(px - fromX, py - fromY) > FLEE_ALERT) return;
    action = "flee";
    chaseTarget = null;
    actSub = "";
    actTimer = 0; // dart-kick cooldown; 0 = armed
    phase = "burst";
  };

  // Pick a feasible action (light weighting; no config table) and arm its first
  // sub-phase. Bottom species lean toward sifting/resting; chase needs a neighbour.
  const pickAction = () => {
    const choices: FishAction[] = ["dart", "hover"];
    if (canSift) choices.push("sift");
    if (canGulp) choices.push("gulp");
    if (benthic) choices.push("sift", "rest"); // nose/rest more on the bottom

    let target: GameObj | null = null;
    let best = CHASE_RANGE;
    for (const o of k.get("fish")) {
      if (o === fish) continue;
      // Only chase a slower species — a pursuit the chaser can actually win.
      if ((o as unknown as { kindSpeed: number }).kindSpeed >= sp) continue;
      const d = Math.hypot(o.pos.x - px, o.pos.y - py);
      if (d < best) {
        best = d;
        target = o;
      }
    }
    if (target) choices.push("chase");

    action = k.choose(choices);
    actSub = "descend";
    actTimer = 0;
    phase = "burst";
    if (action === "gulp") {
      actSub = "rise";
      depth = minY;
    } else if (action === "dart") {
      const dir = k.chance(0.6) ? -heading : heading; // often spook into a reversal
      heading = dir;
      vx += dir * DART_IMPULSE;
      vy += k.rand(-0.35, 0.35) * DART_IMPULSE;
      actTimer = k.rand(0.4, 0.8);
    } else if (action === "hover") {
      depth = py;
      phase = "coast";
      actTimer = k.rand(2, 3);
    } else if (action === "chase") {
      chaseTarget = target;
      actTimer = k.rand(2.5, 4);
    }
  };

  const endAction = () => {
    action = "none";
    chaseTarget = null;
    actCooldown = k.rand(ACTION_EVERY[0], ACTION_EVERY[1]);
    depth = inBand();
    phase = "burst";
    timer = k.rand(0.4, 0.9);
  };

  // Per-frame action behaviour: set targets/impulses; effects fire on contact;
  // each action ends itself. The shared integrator below does the actual moving.
  const runAction = (dt: number) => {
    const sandY = sandTopAt(clamp(px, 0, k.width() - 1));
    const atSand = py >= sandY - NOSE_GAP - 4 * RES;
    switch (action) {
      case "sift":
        if (actSub === "descend") {
          depth = sandY - NOSE_GAP;
          phase = "burst";
          if (atSand) {
            spawnSandPuff(k, fish.headX, sandY, 3, 1.8); // big high burst as it strikes the sand
            actSub = "surf";
            actTimer = k.rand(1.2, 2.6); // nose along the bottom for a while
            siftPuffTimer = k.rand(0.15, 0.35);
          }
        } else if (actSub === "surf") {
          // hug the sand and keep nosing forward, trailing smaller puffs at a
          // jittered cadence so the disturbance reads natural, not metronomic
          depth = sandY - NOSE_GAP;
          phase = "burst";
          if ((siftPuffTimer -= dt) <= 0 && atSand) {
            spawnSandPuff(k, fish.headX, sandY, k.rand(0.25, 0.5));
            siftPuffTimer = k.rand(0.15, 0.4);
          }
          if ((actTimer -= dt) <= 0) {
            actSub = "rise";
            actTimer = k.rand(0.2, 0.5);
            depth = inBand();
          }
        } else if ((actTimer -= dt) <= 0) endAction();
        break;
      case "rest":
        if (actSub === "descend") {
          depth = sandY - NOSE_GAP;
          phase = "burst";
          if (atSand) {
            spawnSandPuff(k, fish.headX, sandY, 2.1, 1.8); // big high burst as it drops onto the sand
            actSub = "hold";
            actTimer = k.rand(3, 8);
          }
        } else {
          depth = sandY - NOSE_GAP;
          phase = "coast";
          vx += (0 - vx) * 5 * dt; // settle near-still on the substrate
          vy += (0 - vy) * 5 * dt;
          if ((actTimer -= dt) <= 0) endAction();
        }
        break;
      case "gulp":
        if (actSub === "rise") {
          depth = minY;
          phase = "burst";
          if (py <= minY + 6 * RES) {
            spawnBubble(k, fish.headX, py - 4 * RES, k.randi(1, 3));
            actSub = "linger";
            actTimer = k.rand(0.3, 0.7);
          }
        } else if ((actTimer -= dt) <= 0) endAction();
        break;
      case "dart":
        phase = "burst";
        if ((actTimer -= dt) <= 0) endAction();
        break;
      case "hover":
        phase = "coast";
        depth = py;
        vx += (0 - vx) * 4 * dt;
        vy += (0 - vy) * 4 * dt;
        if ((actTimer -= dt) <= 0) endAction();
        break;
      case "chase": {
        if (!chaseTarget || !chaseTarget.exists()) {
          endAction();
          return;
        }
        const dist = Math.hypot(chaseTarget.pos.x - px, chaseTarget.pos.y - py);
        heading = Math.sign(chaseTarget.pos.x - px) || heading;
        depth = chaseTarget.pos.y;
        phase = "burst";
        (
          chaseTarget as unknown as { menace: (x: number, y: number) => void }
        ).menace(px, py);
        if (dist > CHASE_GIVEUP || (actTimer -= dt) <= 0) endAction();
        break;
      }
      case "flee": {
        // The threat sighting has gone stale (pursuit broke off) — relax.
        if (threatFor <= 0) {
          endAction();
          return;
        }
        const dx = px - threatX;
        const dy = py - threatY;
        const d = Math.hypot(dx, dy) || 1;
        heading = Math.sign(dx) || heading;
        // Keep sliding off the pursuer's line vertically, within the tank.
        depth = clamp(py + Math.sign(dy || 1) * 24 * RES, minY, maxY());
        phase = "burst";
        // Urgency ramps 0 → 1 as the pursuer closes from the alert edge to
        // point-blank, scaling the escape thrust in the integrator below.
        fleeUrgency = clamp((FLEE_ALERT - d) / (FLEE_ALERT - FLEE_DART), 0, 1);
        actTimer -= dt;
        if (d < FLEE_DART && actTimer <= 0) {
          // Point-blank climax: one hard kick straight away, then keep fleeing.
          actTimer = 1.2; // re-arm delay so repeat kicks can't machine-gun
          vx += heading * DART_IMPULSE * 0.8;
          vy +=
            (Math.sign(dy) || k.choose([-1, 1])) *
            k.rand(0.08, 0.2) *
            DART_IMPULSE;
        }
        break;
      }
    }
  };

  fish.flipX = facingRight;

  // Separation: while another fish is within sensor range, accelerate away from
  // it, harder the closer it is. They veer around each other rather than overlap;
  // the existing drag settles the push. onCollideUpdate fires per overlapping
  // neighbor each frame, and this closure shares vx/vy with the motion loop.
  fish.onCollideUpdate("fish", (other) => {
    const dt = k.dt();
    const dir = facingRight ? 1 : -1;
    const mine: [number, number][] = [
      [px + dir * bodyOff, py], // head
      [px - dir * bodyOff, py], // tail
    ];
    const o = other as unknown as Record<string, number>;
    const theirs: [number, number][] = [
      [o.headX, o.headY],
      [o.tailX, o.tailY],
    ];
    // Separate the nearest head/tail point-pairs so the whole length of each
    // body is respected, not just its center. Force-based steering veers them
    // apart; the positional nudge resolves real overlaps even in a crowd.
    for (const [mx, my] of mine) {
      for (const [ox, oy] of theirs) {
        const dx = mx - ox;
        const dy = my - oy;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= PAIR_DIST) continue;
        const nx = dx / d;
        const ny = dy / d;
        vx += nx * Math.min(AVOID_MAX, AVOID / d) * dt;
        vy += ny * Math.min(AVOID_MAX, AVOID / d) * dt;
        const push = (PAIR_DIST - d) * SEPARATION;
        px += nx * push;
        py += ny * push;
      }
    }
  });

  // A fish that ends up fully offscreen (a dart can outrun the wall steering) is
  // gone for good — despawn it and let the caller introduce a replacement. The
  // guard waits until the fish has actually been in view, so an edge-entering
  // spawn isn't culled at birth.
  let hasEntered = false;

  fish.onUpdate(() => {
    const dt = k.dt();
    const w = k.width();

    if (threatFor > 0) threatFor -= dt;

    if (!hasEntered) {
      if (px >= 0 && px <= w) hasEntered = true;
    } else if (px < -pad || px > w + pad) {
      fish.destroy();
      opts.onGone?.();
      return;
    }

    // Action layer: count down to the next action while idle, otherwise drive the
    // current one. An action owns `phase`/`depth`/`heading` while it runs, so the
    // routine burst/coast machine below is paused until it ends.
    if (action === "none") {
      actCooldown -= dt;
      if (actCooldown <= 0) pickAction();
    } else {
      runAction(dt);
    }

    // Routine burst/coast (paused during an action, which sets its own phase).
    if (action === "none") {
      timer -= dt;
      if (timer <= 0) {
        if (phase === "burst") {
          phase = "coast";
          timer = k.rand(0.6, 1.7);
        } else {
          phase = "burst";
          timer = k.rand(0.4, 0.9);
          if (k.rand() < 0.12) heading *= -1; // occasional wander turn
          if (k.rand() < 0.5) depth = k.rand(bandTop(), bandBot());
        }
      }
    }

    // Steer away from the walls; the burst then carries the turn through.
    const margin = 50 * RES;
    if (px < margin) heading = 1;
    else if (px > w - margin) heading = -1;

    // Burst applies thrust; coast applies none. Drag acts in both phases, so a
    // coast is a decelerating glide. A fleeing fish's thrust grows with urgency.
    const boost =
      action === "chase"
        ? CHASE_ACCEL
        : action === "flee"
          ? 1 + fleeUrgency * (FLEE_ACCEL - 1)
          : 1;
    const ax = phase === "burst" ? heading * ACCEL * sp * boost : 0;
    const ay = phase === "burst" ? clamp((depth - py) * 0.9, -34 * RES, 34 * RES) : 0;
    vx += ax * dt;
    vy += ay * dt;
    vx -= vx * DRAG * dt;
    vy -= vy * VDRAG * dt;
    vy = clamp(vy, -VMAX, VMAX);

    px += vx * dt;
    py += vy * dt;

    // Sift/rest dive onto the dune (below the normal band floor); the relaxed floor
    // also stays in effect while the fish is still below maxY after one, so it eases
    // back up instead of snapping at the band edge.
    const floor =
      action === "sift" || action === "rest" || py > maxY()
        ? sandTopAt(clamp(px, 0, w - 1)) - NOSE_GAP
        : maxY();
    if (py < minY) {
      py = minY;
      vy = Math.abs(vy) * 0.3;
    } else if (py > floor) {
      py = floor;
      vy = -Math.abs(vy) * 0.3;
    }

    // Facing flips only once travel is clearly horizontal, so a turn reads as a
    // slow reversal rather than a snap.
    if (vx > 6 * RES) facingRight = true;
    else if (vx < -6 * RES) facingRight = false;
    fish.flipX = facingRight;

    // Pitch toward the travel direction, clamped so the fish never goes vertical.
    const slope = clamp(Math.atan2(vy, Math.abs(vx) + 8 * RES), -MAX_TILT, MAX_TILT);
    const targetAngle = ((facingRight ? slope : -slope) * 180) / Math.PI;
    ang = lerpTo(ang, targetAngle, 8, dt);

    // Snap the rendered transform: position to the pixel grid, pitch to fixed
    // tilt steps (the float state above stays smooth). A shallow slope snaps to
    // 0°, keeping slow horizontal swimmers perfectly crisp.
    fish.pos.x = Math.round(px);
    fish.pos.y = Math.round(py);
    // Depth-sort by its own y: a fish never descends below the sand crest, so
    // it slips behind whatever is rooted on the dune as it swims past.
    fish.z = groundZ(py);
    fish.angle = Math.round(ang / TILT_STEP) * TILT_STEP;

    // Publish body points for neighbours' separation checks.
    const dir = facingRight ? 1 : -1;
    fish.headX = px + dir * bodyOff;
    fish.headY = py;
    fish.tailX = px - dir * bodyOff;
    fish.tailY = py;

    // Tail beats faster under thrust, nearly stops while gliding.
    const speed = Math.hypot(vx, vy);
    const targetBeat = phase === "burst" ? Math.min(13, 4 + (speed * 0.18) / RES) : 1.2;
    beat = lerpTo(beat, targetBeat, 6, dt);
    fish.animSpeed = beat * motionBeatScale(motion);
  });

  return fish;
}

// Frame-rate-independent exponential approach toward a target.
function lerpTo(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
