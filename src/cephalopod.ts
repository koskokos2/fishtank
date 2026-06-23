// Cephalopods: a second creature family alongside the fish, sharing one spawn +
// motion scaffold. Three kinds, each driven by its `motion` and pose config:
//    - Octopus: a benthic, atlas-based creature whose poses are baked to a sprite
//    sheet by tools/gen-octopus-atlas.ts. It rests ON the sand (riding the dune
//    contour from backdrop's sandTopAt) for a few seconds up to ~a minute, arms
//    held still; between rests it hops a short way, cycling a baked arm-sway loop
//    only while moving; and now and then pushes off into a short pulse-glide swim
//    (single pulse/glide poses), then settles back onto the substrate.
//  - Nautilus: one sea-creature atlas cell with a baked tentacle-wiggle sheet
//    (like the fish tail-swish). Pulsatile jet — posterior-first most of the time,
//    occasional anterior-first amble, with a squash-flip turnaround.
//  - Jellyfish: one sea-creature atlas cell with a baked horizontal tentacle sway
//    plus a runtime bell-pulse squash; rises in pulses and sinks between, upright.

import type { KAPLAYCtx } from "kaplay";
import {
  SEA_CREATURES_ATLAS,
  SEA_CREATURES_ATLAS_CELL,
  SEA_CREATURES_ATLAS_COLS,
  SEA_CREATURE_NAUTILUS_INDEX,
  SEA_CREATURE_JELLYFISH_INDEX,
} from "./seaCreaturesAtlas";
import { OCTOPUS_IDLE_FRAMES, OCTOPUS_POSE } from "./octopusAtlas";
import { sandTopAt } from "./backdrop";
import {
  type Buf,
  SWIM_FRAMES,
  cellBBox,
  copyRect,
} from "./fishbake";
import { RES } from "./res";

const S = RES;

// =========================== OCTOPUS ART ===========================
// The octopus sprite is a sheet baked by tools/gen-octopus-atlas.ts from the atlas's
// twelve "assembled" poses (the component body/tentacle layers don't overlay cleanly, so
// we use the artist's whole-octopus poses). Frames 0..OCTOPUS_IDLE_FRAMES-1 are the
// idle_hover pose with its arms gently swaying (the in-place hover loop); the rest are the
// single crawl/rest/swim poses, indexed by name via OCTOPUS_POSE. The crawl/swim machine
// below selects the frame per state.
const OCTO_IDLE_FPS = 5; // idle arm-sway loop speed (subtle hover)
const OCTO_STRIDE = 7 * S; // px of horizontal travel per crawl-gait pose step
// The benthic crawl gait: a reach-and-pull cycle through the baked low-crawl poses,
// advanced by distance travelled and played as a ping-pong (forward then backward).
// The poses are ordered by rising body posture — flat-on-sand → sprawled → reaching →
// fully gathered/compressed — so playing up then back down reads as the octopus humping
// its body along (gather up, then push down and forward), with no snap at the loop seam.
const CRAWL_GAIT = [
  OCTOPUS_POSE.rest,
  OCTOPUS_POSE.settledRest,
  OCTOPUS_POSE.activeSwimPulse,
  OCTOPUS_POSE.crawlPush,
] as const;
const OCTO_SIT = 26; // body-centre height (px) above the sand so the arms rest on it
const OCTO_DESCEND_STOP = 22 * S; // height above the sand where the descent push-pulses quit
const OCTO_LAND_POSE = 6 * S; // height above the sand where it braces into the landing pose
const BURY_DEPTH = 4 * S; // px the body presses into the sand on touchdown
const BURY_DUR = 0.35; // s for the landing press-in to ease back out
// Sand grain tints for the landing puff, matching backdrop.ts SAND (shadow/body/lit).
const SAND_PUFF: [number, number, number][] = [
  [120, 96, 56],
  [180, 148, 88],
  [206, 176, 110],
];

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

// =========================== ENTITY ===========================
type KindCfg = {
  sprite: string;
  z: number;
  drag: number; // water resistance bleeding every glide
  level: { min: number; max: number }; // preferred vertical band (fractions)
  anim?: string; // sprite-sheet anim to loop (the nautilus/jellyfish atlas)
  refSpeed?: number; // speed that fully ramps the looped atlas anim (nautilus/jelly)
  motion: "jet" | "crawl" | "pulse";
  // jet kind (nautilus): arms-first cruise + tail-first pulse, weighted by bias.
  cruise?: number;
  segCruise?: [number, number];
  jet?: { interval: [number, number]; impulse: number; vert: number };
  segJet?: [number, number];
  armsBias?: number;
  // crawl kind (octopus): a slow omnidirectional benthic crawl that now and then
  // pushes off into a short pulse-glide swim bout, then resettles low.
  crawl?: {
    speed: number; // crawl drift speed
    hop: number; // max horizontal distance of one crawl hop between rests
    // On arriving at a hop it parks and rests: usually `secs`, but with `longChance`
    // a longer `longSecs` rest. A resting octopus holds still (arms still sway) and
    // won't push off for a swim, so long rests actually last.
    rest: { secs: [number, number]; longSecs: [number, number]; longChance: number };
    swimEvery: [number, number]; // cooldown between swim bouts (s), accrued while moving
    gather: number; // wind-up (bunch) duration (s)
    thrust: number; // power-stroke pose hold (s)
    glide: [number, number]; // coast duration per pulse (s)
    pulses: [number, number]; // pulses chained per bout
    impulse: number; // forward push per pulse
    vert: number; // up share of the push (0..1)
    sink: number; // settle sink speed back toward the band
    // Some excursions become a roaming "swim-around": it lifts off and wanders
    // left/right a clearance above the sand for a while before settling back down.
    roamChance: number; // chance a dive becomes a swim-around
    roamSecs: [number, number]; // how long it swims around before settling (s)
    roamHover: [number, number]; // px clearance kept above the sand while roaming
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
    driftX?: number; // directed horizontal impulse toward roam target tx
    squash: number; // bell scale.y at full contraction (≤ 1)
    roam: [number, number]; // how often it picks a new target depth (s)
  };
};

const KINDS: Record<string, KindCfg> = {
  octopus: {
    sprite: "octopus",
    z: 18,
    drag: 1.8,
    level: { min: 0.62, max: 0.92 }, // benthic — hugs the lower tank
    motion: "crawl",
    crawl: {
      speed: 16 * S, // slow omnidirectional drift
      hop: 200 * S, // hops a moderate distance, then parks and rests
      rest: { secs: [5, 20], longSecs: [20, 80], longChance: 0.3 },
      swimEvery: [6, 12], // occasionally push off for a swim
      gather: 0.16, // bunch up
      thrust: 0.12, // power-stroke hold
      glide: [0.5, 0.9], // coast per pulse
      pulses: [2, 5], // chain several pulses per dive
      impulse: 90 * S, // forward push per pulse
      vert: 0.55, // up share — lifts off the bottom into a short arc
      sink: 26 * S, // settle back down to the substrate
      roamChance: 0.4, // some dives become a roaming swim-around
      roamSecs: [3, 8], // duration of a swim-around before settling
      roamHover: [40 * S, 90 * S], // clearance kept above the sand while roaming
    },
  },
  nautilus: {
    sprite: "nautilus",
    z: 16,
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
      driftX: 14 * S, // directed horizontal drift toward roam tx
      squash: 0.8,
      roam: [4, 8],
    },
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const TILT_STEP = 7;

// A short-lived burst of sand grains kicked up where the octopus touches down.
// Built as lightweight game objects in the tank.ts particle idiom (k.add + onUpdate
// + destroy), not Kaplay's particles(), so the grains stay crisp and cheap. Each
// grain pops up from the sand surface beneath the octopus, then falls back under
// gravity and fades as it settles.
function spawnSandPuff(
  k: KAPLAYCtx,
  x: number,
  sandY: number,
  scale = 1,
  riseMul = 1,
  settleMul = 1,
) {
  const minN = Math.max(2, Math.round(112 * scale));
  const maxN = Math.max(minN + 1, Math.round(176 * scale));
  const n = k.randi(minN, maxN);
  for (let i = 0; i < n; i++) {
    const sz = k.randi(1, 3); // fine 1-2px specks (intentionally sub-grid — sand dust)
    const tone = k.choose(SAND_PUFF);
    const g = k.add([
      k.rect(sz, sz),
      k.pos(x + k.rand(-16, 16) * S, sandY - k.rand(0, 3) * S),
      k.color(tone[0], tone[1], tone[2]),
      k.opacity(k.rand(0.75, 1)),
      k.z(19), // in front of the octopus body (z 18) so the puff isn't occluded
    ]);
    let vx = k.rand(-14, 14) * S;
    let vy = -k.rand(16, 34) * S * riseMul; // gentle pop upward
    const grav = (k.rand(34, 54) * S) / Math.max(0.01, settleMul); // weaker gravity settles slower
    const drag = 2.6; // water resistance: grains decelerate and drift, not plummet
    const originY = g.pos.y;
    let age = 0;
    g.onUpdate(() => {
      const dt = k.dt();
      age += dt;
      vy += grav * dt; // sink back down slowly
      vx -= vx * drag * dt; // water damping
      vy -= vy * drag * dt;
      g.pos.x += vx * dt;
      g.pos.y += vy * dt;
      if (age > 0.6 * settleMul) g.opacity -= dt * (0.7 / Math.max(0.01, settleMul)); // hold, then fade as it settles
      if ((vy > 0 && g.pos.y >= originY) || age > 2.4 * settleMul || g.opacity <= 0) g.destroy();
    });
  }
}

export function spawnCephalopod(k: KAPLAYCtx, kindName: keyof typeof KINDS) {
  const cfg = KINDS[kindName];
  const minY = 24 * S;
  const maxY = () => k.height() * 0.78;
  const bandTop = () => minY + (maxY() - minY) * cfg.level.min;
  const bandBot = () => minY + (maxY() - minY) * cfg.level.max;
  // Octopus only: the seated height on the sand contour at column x — its body
  // centre rides OCTO_SIT above the dune so the arms drape onto the ground.
  const groundY = (x: number) => sandTopAt(clamp(x, 0, k.width() - 1)) - OCTO_SIT;

  const body = k.add([
    k.sprite(cfg.sprite),
    k.pos(k.rand(60 * S, k.width() - 60 * S), k.rand(bandTop(), bandBot())),
    k.anchor("center"),
    k.rotate(0),
    k.scale(1),
    k.z(cfg.z),
  ]);

  let vx = 0;
  let vy = 0;
  let px = body.pos.x;
  let py = cfg.motion === "crawl" ? groundY(px) : body.pos.y; // octopus spawns on the sand
  let ang = 0;
  let facing = k.choose([-1, 1]); // head/eye direction (left-facing sprite)
  const swayPhase = k.rand(0, OCTOPUS_IDLE_FRAMES); // desync the idle arm-sway loop
  let gaitPhase = swayPhase; // crawl reach<->push phase, advanced by distance crawled

  // jet-kind (nautilus) state
  let heading = facing;
  let mode: "cruise" | "jet" = "cruise";
  let depth = py;
  let segTimer = k.rand(cfg.segCruise?.[0] ?? 3, cfg.segCruise?.[1] ?? 6);
  let jetTimer = 0;

  // crawl-kind (octopus) state: a crawl target, and a swim sub-machine for the
  // occasional pulse-glide bout.
  let tx = px;
  let roamTimer = 0;
  let octoMode: "crawl" | "swim" = "crawl";
  let swimSub: "gather" | "thrust" | "glide" | "settle" = "gather";
  let subTimer = 0;
  let pulsesLeft = 0;
  let descending = false; // pulses spent → stroking down toward the sand (mirrors the sideways push)
  let swimDir = facing;
  let curlTimer = 0; // briefly show the curled "turn" pose after a turn
  // Per-octopus tempo so two on screen don't fall into lockstep: one is durably
  // lazier — longer rests, slower to push off, bigger but rarer hops.
  const tempo = k.rand(0.8, 1.25);
  // Personality: each octopus is either mostly-short or mostly-long resting — a coin
  // flip picks which way its rests lean (30/70 long-to-short, or the reverse).
  const longRestChance = k.chance(0.5) ? 0.3 : 0.7;
  let restTimer = k.rand(1, 9) * tempo; // octopus: time left parked-and-resting on the ground
  let buryTimer = 0; // octopus: time left in the press-into-sand dip after a landing
  let restLong = false; // this rest is a long park → curl up (settled) rather than spread
  let swimVigorous = false; // this swim bout is multi-pulse → use the energetic pose row
  let swimRoaming = false; // this excursion wanders the water before settling
  let swimRoamLeft = 0; // seconds of roaming left
  let swimHover = 0; // target clearance above the sand while roaming
  let swimCooldown =
    k.rand(cfg.crawl?.swimEvery[0] ?? 6, cfg.crawl?.swimEvery[1] ?? 12) * tempo;
  let crawlPuffTimer = k.rand(0.12, 0.25);

  // pulse-kind (jellyfish) state: a 3-phase bell-pump cycle and the live bell
  // squash it drives.
  let pulsePhase: 0 | 1 | 2 = 2; // 0 contract, 1 relax, 2 coast
  let pulseTimer = k.rand(cfg.pulse?.coast[0] ?? 0.5, cfg.pulse?.coast[1] ?? 1.4);
  let bellSquash = 1; // current scale.y (≤ 1; 1 = relaxed bell)
  if (cfg.motion === "pulse") roamTimer = 0; // pick tx and depth on first update

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
    let allowPitch = true; // crawl forces this off; swim turns it back on
    let buryNow = 0; // octopus: current press-into-sand depth (px), eases to 0

    if (cfg.motion === "crawl") {
      // OCTOPUS: a benthic crawler. It hops a short way along the sand, then parks
      // and rests ON the ground (usually a few seconds, sometimes much longer),
      // arms gently swaying — and now and then pushes off into a short pulse-glide
      // swim bout before settling back onto the substrate. Its vertical rides the
      // sand contour (groundY) while crawling/resting; swim bouts lift it off.
      const cr = cfg.crawl!;
      curlTimer -= dt;
      buryTimer = Math.max(0, buryTimer - dt);
      buryNow = BURY_DEPTH * (buryTimer / BURY_DUR); // sinks on impact, springs back
      if (octoMode === "crawl") {
        if (restTimer > 0) {
          // PARKED & RESTING: hold still; a swim never interrupts a rest, so the
          // long rests actually last.
          restTimer -= dt;
          vx += (0 - vx) * 4 * dt;
          if (restTimer <= 0) {
            // rest over → hop a moderate way along the sand (biased off the walls)
            const dir =
              px < mX * 2 ? 1 : px > k.width() - mX * 2 ? -1 : k.choose([-1, 1]);
            tx = clamp(px + dir * k.rand(60 * S, cr.hop) * tempo, mX, k.width() - mX);
            if (dir !== facing) curlTimer = 0.5; // curl its arms through the turn
            beginTurn(dir);
          }
        } else {
          // crawling toward the hop; close enough → settle and rest a while
          const dx = tx - px;
          if (Math.abs(dx) < 12 * S) {
            restLong = k.chance(longRestChance);
            restTimer =
              (restLong
                ? k.rand(cr.rest.longSecs[0], cr.rest.longSecs[1])
                : k.rand(cr.rest.secs[0], cr.rest.secs[1])) * tempo;
            vx += (0 - vx) * 4 * dt;
          } else {
            const sp = cr.speed * Math.min(1, Math.abs(dx) / (12 * S));
            vx += (Math.sign(dx) * sp - vx) * 4 * dt;

            // While crawling over the substrate, kick up small periodic puffs so
            // movement reads as contact with the sand instead of gliding over it.
            crawlPuffTimer -= dt;
            if (crawlPuffTimer <= 0 && Math.abs(vx) > cr.speed * 0.35) {
              spawnSandPuff(
                k,
                px + facing * 8 * S,
                sandTopAt(clamp(px, 0, k.width() - 1)),
                0.32,
                1,
                2,
              );
              crawlPuffTimer = k.rand(0.12, 0.28);
            }
          }
          // only push off for a swim while actively moving (rests are protected)
          swimCooldown -= dt;
          if (swimCooldown <= 0) {
            octoMode = "swim";
            swimSub = "gather";
            subTimer = cr.gather;
            descending = false;
            pulsesLeft = Math.round(k.rand(cr.pulses[0], cr.pulses[1]));
            swimRoaming = k.chance(cr.roamChance); // wander the water, or a single dive?
            swimRoamLeft = swimRoaming ? k.rand(cr.roamSecs[0], cr.roamSecs[1]) : 0;
            swimHover = k.rand(cr.roamHover[0], cr.roamHover[1]);
            swimVigorous = swimRoaming || pulsesLeft >= 2; // energetic pose row
            swimDir =
              px < mX * 2 ? 1 : px > k.width() - mX * 2 ? -1 : k.choose([-1, 1]);
            if (swimDir !== facing) curlTimer = 0.4; // curl through the launch turn
            beginTurn(swimDir);
          }
        }
        // ride the sand contour: a P-controller eases py to the seated ground height
        // (offset down by buryNow right after a landing, so it presses in and recovers)
        vy = clamp((groundY(px) + buryNow - py) * 8, -cr.speed * 4, cr.speed * 4);
      } else {
        // SWIM bout: bunch (gather) → power stroke (thrust, the impulse) → coast
        // (glide). After the last pulse a single dive glides back down to the sand;
        // a roaming excursion instead redirects and keeps wandering until its time
        // runs out, then glides down.
        const wallNear = 72 * S;
        if (px < mX + wallNear && swimDir < 0) {
          swimDir = 1;
          beginTurn(1);
        } else if (px > k.width() - mX - wallNear && swimDir > 0) {
          swimDir = -1;
          beginTurn(-1);
        }

        if (swimRoaming) swimRoamLeft -= dt;
        subTimer -= dt;
        if (swimSub === "gather") {
          if (subTimer <= 0) {
            swimSub = "thrust";
            subTimer = cr.thrust;
            vx += swimDir * cr.impulse; // forward power stroke
            if (descending) {
              // Stroking back down to the sand: the power stroke now drives the
              // body downward, the mirror of the lift below.
              vy += cr.impulse * cr.vert;
            } else {
              // A roamer only lifts until it reaches its hover line above the sand,
              // then strokes are horizontal (no gravity here, so altitude holds).
              const hoverY = groundY(px) - swimHover;
              const climb = swimRoaming ? clamp((py - hoverY) / (30 * S), 0, 1) : 1;
              vy -= cr.impulse * cr.vert * climb;
            }
          }
        } else if (swimSub === "thrust") {
          if (subTimer <= 0) {
            swimSub = "glide";
            subTimer = k.rand(cr.glide[0], cr.glide[1]);
          }
        } else if (swimSub === "glide") {
          if (subTimer <= 0) {
            if (descending) {
              // Keep bunching and stroking down until close to the sand; only then
              // stop pushing and let it settle the last stretch.
              if (py < groundY(px) - OCTO_DESCEND_STOP) {
                swimSub = "gather";
                subTimer = cr.gather;
              } else swimSub = "settle";
            } else {
              pulsesLeft -= 1;
              if (pulsesLeft > 0) {
                swimSub = "gather";
                subTimer = cr.gather;
              } else if (swimRoaming && swimRoamLeft > 0) {
                // keep roaming: a short bout in a fresh inward direction
                pulsesLeft = Math.round(k.rand(1, 2));
                swimSub = "gather";
                subTimer = cr.gather;
                const dir =
                  px < mX * 2 ? 1 : px > k.width() - mX * 2 ? -1 : k.choose([-1, 1]);
                if (dir !== swimDir) curlTimer = 0.4; // curl through the turn
                swimDir = dir;
                beginTurn(dir);
              } else if (py < groundY(px) - OCTO_DESCEND_STOP) {
                // still high above the sand → descend with downward push-pulses
                descending = true;
                swimSub = "gather";
                subTimer = cr.gather;
              } else swimSub = "settle";
            }
          }
        } else {
          // SETTLE: very close to the sand now (the push-pulses quit above it).
          // Stop stroking, keep a little forward glide while sinking the last bit,
          // and touch down.
          const inwardDir =
            px < mX + 18 * S ? 1 : px > k.width() - mX - 18 * S ? -1 : swimDir;
          if (inwardDir !== swimDir) {
            swimDir = inwardDir;
            beginTurn(inwardDir);
          }
          vx += (swimDir * cr.speed * 2.2 - vx) * 3 * dt;
          vy += cr.sink * dt;
          if (py >= groundY(px) - 4 * S && vy >= 0) {
            octoMode = "crawl";
            descending = false;
            // touchdown: kick up a puff of sand and press the body into it
            spawnSandPuff(k, px, sandTopAt(clamp(px, 0, k.width() - 1)), 2, 2, 2);
            buryTimer = BURY_DUR;
            restLong = false;
            restTimer = k.rand(2, 5) * tempo; // rest a moment after touching down
            tx = px; // hop afresh from where it landed
            swimCooldown = k.rand(cr.swimEvery[0], cr.swimEvery[1]) * tempo;
          }
        }
      }
      allowPitch = octoMode === "swim"; // level while crawling, pitch while gliding
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
        tx = k.rand(mX, k.width() - mX); // pick a new horizontal target alongside depth
      }

      pulseTimer -= dt;
      if (pulseTimer <= 0) {
        if (pulsePhase === 2) {
          pulsePhase = 0; // coast → contract: the active power stroke
          pulseTimer = p.contract;
          vy -= p.thrust * climb; // only push up as much as it needs to climb
          vx += Math.sign(tx - px) * (p.driftX ?? p.drift); // steer toward horizontal roam target
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
      allowPitch = false; // upright, radially symmetric
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
    // The octopus's floor is the sand it sits on; others use the generic low band.
    const floorY = cfg.motion === "crawl" ? groundY(px) + buryNow : maxY();
    py = clamp(py, minY, floorY);

    // Keep inside the tank; the jet kind retargets a fresh inward segment on
    // contact, a swimming octopus cuts the bout short to settle, the crawl kind
    // just clamps (its roam target steers it back).
    const hitWall = px < mX || px > k.width() - mX;
    if (px < mX) {
      px = mX;
      if (vx < 0) vx = 0;
    } else if (px > k.width() - mX) {
      px = k.width() - mX;
      if (vx > 0) vx = 0;
    }
    if (hitWall) {
      if (cfg.motion === "jet") segTimer = 0;
      if (octoMode === "swim") {
        // Treat wall contact as a turn cue, not a hard dead-end.
        const inward = px < k.width() / 2 ? 1 : -1;
        swimDir = inward;
        beginTurn(inward);
        vx = inward * Math.max(Math.abs(vx) * 0.35, cfg.crawl!.speed * 0.9);
        // A roamer keeps wandering; a single dive transitions to glide-down.
        if (!(swimRoaming && swimRoamLeft > 0)) swimSub = "settle";
      }
    }

    // Jellyfish tilts lazily toward its horizontal travel direction; all other
    // creatures either pitch into their travel slope (gliding) or stay level.
    if (cfg.motion === "pulse") {
      const jellyTilt = clamp(vx / (10 * S), -1, 1) * 12; // ±12° based on lateral speed
      ang += (jellyTilt - ang) * (1 - Math.exp(-4 * dt)); // responsive lean
    } else {
      const travelDir = vx >= 0 ? 1 : -1;
      const slope = allowPitch
        ? clamp(Math.atan2(vy, Math.abs(vx) + 10 * S), -0.3, 0.3)
        : 0;
      const targetPitch = ((travelDir > 0 ? slope : -slope) * 180) / Math.PI;
      ang += (targetPitch - ang) * (1 - Math.exp(-6 * dt));
    }

    body.pos.x = Math.round(px);
    body.pos.y = Math.round(py);
    body.angle = cfg.motion === "pulse"
      ? ang // smooth tilt — no snap; jellyfish is radially symmetric
      : Math.round(ang / TILT_STEP) * TILT_STEP;
    if (cfg.motion === "pulse") body.scale.y = bellSquash; // the bell pump

    // Octopus: pick the pose for the current state, driving all twelve baked poses.
    //  - parked: resting_on_sand (short) or curled-up settled_curled_rest (long park);
    //  - crawling: a 3-phase reach-and-pull gait (gather → reach → full stretch),
    //    curled_turn flashed through a heading change;
    //  - swimming: reach push-off (gather) → swim_pulse (thrust) → glide_streaming → hover
    //    down (settle), using the energetic "active" pose row on multi-pulse bouts.
    if (cfg.motion === "crawl") {
      const P = OCTOPUS_POSE;
      const idleFrame =
        Math.floor(k.time() * OCTO_IDLE_FPS + swayPhase) % OCTOPUS_IDLE_FRAMES;
      let frame: number;
      if (octoMode === "swim") {
        if (curlTimer > 0) frame = swimVigorous ? P.activeCurl : P.curl;
        else if (swimSub === "gather") frame = P.activeCrawlReach; // reaching push-off
        else if (swimSub === "thrust") frame = swimVigorous ? P.activeSwimPulse : P.swimPulse;
        else if (swimSub === "glide") frame = swimVigorous ? P.activeGlide : P.glide;
        // settle: hold the glide pose through the final sink, then brace with the
        // second crawl pose only very-very close to touchdown.
        else if (py < groundY(px) - OCTO_LAND_POSE) frame = swimVigorous ? P.activeGlide : P.glide;
        else frame = P.crawlPush;
      } else if (restTimer > 0) {
        // parked & resting (arms held still): a curled-up ball for short rests, the
        // flat sprawled-out low pose for long settles.
        frame = restLong ? P.crawlReach : P.settledRest;
      } else if (curlTimer > 0) {
        frame = P.curl; // flash a curl through a crawl turn
      } else {
        // crawling along the sand: a ping-pong through the gait poses (up then back
        // down) advanced by distance travelled, so it holds its pose when slow/stopped
        // instead of cycling on the spot.
        gaitPhase += (Math.abs(vx) * dt) / OCTO_STRIDE;
        const period = 2 * (CRAWL_GAIT.length - 1); // forward then backward
        const t = Math.floor(gaitPhase) % period;
        frame = CRAWL_GAIT[t < CRAWL_GAIT.length ? t : period - t];
      }
      body.frame = frame;
    }

    if (cfg.anim) {
      const speedN = Math.min(1, Math.hypot(vx, vy) / (cfg.refSpeed ?? 1));
      // The jellyfish tentacles sway gently and quicken just after a pulse; the
      // nautilus anim ramps harder with speed.
      body.animSpeed =
        cfg.motion === "pulse" ? 1 + speedN * 4 : 0.5 + speedN * 9.5;
    }
  });

  return body;
}
