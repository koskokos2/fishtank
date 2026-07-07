// Cephalopods: a second creature family alongside the fish, sharing one spawn +
// motion scaffold. Three kinds, each driven by its `motion` and pose config:
//    - Octopus: a benthic, atlas-based creature whose poses are baked to a sprite
//    sheet by tools/gen-octopus-atlas.ts. It rests ON the sand (riding the dune
//    contour from backdrop's sandTopAt) for a few seconds up to ~a minute, arms
//    held still; between rests it hops a short way, cycling a baked arm-sway loop
//    only while moving; and now and then pushes off into a short pulse-glide swim
//    (single pulse/glide poses), then settles back onto the substrate.
//  - Nautilus: one fixed shell/body plus independently animated tentacle, siphon,
//    and water-jet layers. Tentacles flow continuously while propulsion and turns
//    drive only the soft parts that actually need to change.
//  - Jellyfish: one identity-stable source split into bell, oral-arm, and long-
//    tendril layers. The bell follows propulsion while both appendage layers keep
//    flowing on independent clocks through coasts, pulses, and turns.

import type { KAPLAYCtx } from "kaplay";
import { OCTOPUS_IDLE_FRAMES, OCTOPUS_POSE } from "./octopusAtlas";
import {
  JELLYFISH_ARMS_START,
  JELLYFISH_BELL_ATTACH_Y,
  JELLYFISH_BELL_START,
  JELLYFISH_LAYER_FRAMES,
  JELLYFISH_LAYER_ROOT_Y,
  JELLYFISH_TENDRILS_START,
} from "./jellyfishAtlas";
import {
  NAUTILUS_BODY_START,
  NAUTILUS_JET_START,
  NAUTILUS_LAYER_FRAMES,
  NAUTILUS_SIPHON_START,
  NAUTILUS_TENTACLES_START,
} from "./nautilusAtlas";
import { sandTopAt } from "./backdrop";
import { spawnSandPuff } from "./sandPuff";
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
// =========================== NAUTILUS ART ===========================
// The shell/body is one invariant layer. Tentacles wave continuously while the
// siphon and water plume follow propulsion, so motion never swaps the animal for
// a differently drawn pose.
const NAUT_TENTACLE_FPS = 7;
const NAUT_TURN_HOLD = 1.45;
const NAUT_JET_POWER = 0.22;
const NAUT_JET_RECOVER = 0.62;
const NAUT_JET_ANTICIPATE = 0.55;

// =========================== JELLYFISH ART ===========================
// The layered atlas has sixteen deterministic frames per row. The bell row is
// state-driven; oral arms and tendrils advance continuously at different rates.
// Because every row comes from one fixed master component, neither body scale nor
// attachment geometry can jump when a frame changes.
const JELLY_ARMS_FPS = 8;
const JELLY_TENDRIL_FPS = 10;
const JELLY_TURN_DUR = 0.55; // tuck/roll duration; flip happens halfway through
const JELLY_FLARE = 0.5; // s the oral-arms flare shows before a startle retreat

// =========================== ENTITY ===========================
type KindCfg = {
  sprite: string;
  z: number;
  drag: number; // water resistance bleeding every glide
  level: { min: number; max: number }; // preferred vertical band (fractions)
  artDir?: 1 | -1; // native sprite heading; the atlases face left (-1, default)
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
    rest: {
      secs: [number, number];
      longSecs: [number, number];
      longChance: number;
    };
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
  // contraction (active power stroke, main thrust) →
  // relaxation (elastic recoil, a smaller "passive energy recapture" thrust) →
  // interpulse (coast + slow sink).
  pulse?: {
    contract: number; // power-stroke duration (s)
    relax: number; // elastic-recoil duration (s)
    coast: [number, number]; // interpulse pause range (s)
    thrust: number; // upward impulse at contraction
    per: number; // passive-recapture impulse at relaxation (fraction of thrust)
    sink: number; // negative buoyancy — slow drift down between pulses
    drift: number; // gentle sideways sway speed (weak horizontal control)
    driftX?: number; // directed horizontal impulse toward roam target tx
    roam: [number, number]; // how often it picks a new target depth (s)
    // Rare startle: oral arms flare, then quick recoil pulses drive it up and
    // away — an occasional accent event, like the octopus's swim bouts.
    startle: { every: [number, number]; boost: number };
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
    sprite: "nautilus-body",
    z: 16,
    drag: 1.1,
    level: { min: 0.08, max: 0.78 },
    motion: "jet",
    cruise: 2 * S,
    segCruise: [3, 5],
    // Persistent posterior-first jet-and-glide travel. Altitude targets run on
    // their own clock, so climbing or descending never requires a turn.
    jet: { interval: [2.3, 4.0], impulse: 12 * S, vert: 0.22 },
    segJet: [14, 22],
    armsBias: 0,
  },
  jellyfish: {
    sprite: "jellyfish-bell",
    z: 15,
    drag: 1.6,
    level: { min: 0.05, max: 0.7 }, // drifts the mid/upper column
    artDir: 1, // the jellyfish atlas leads right — tentacles trail left
    motion: "pulse",
    pulse: {
      contract: 0.4, // readable active power stroke (two held poses)
      relax: 1.0, // slower three-pose elastic recoil / follow-through
      coast: [0.8, 1.7], // unhurried pause before the next pump
      thrust: 34 * S,
      per: 0.32, // passive energy recapture ≈ a third of the active push
      sink: 9 * S, // slowly settles between pulses
      drift: 5 * S, // barely steers sideways
      driftX: 18 * S, // directed horizontal impulse toward roam target tx
      roam: [4, 8],
      startle: { every: [30, 90], boost: 1.7 }, // rare flare-then-recoil retreat
    },
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const TILT_STEP = 7;

export function spawnCephalopod(k: KAPLAYCtx, kindName: keyof typeof KINDS) {
  const cfg = KINDS[kindName];
  const minY = 24 * S;
  const maxY = () => k.height() * 0.78;
  const bandTop = () => minY + (maxY() - minY) * cfg.level.min;
  const bandBot = () => minY + (maxY() - minY) * cfg.level.max;
  // Octopus only: the seated height on the sand contour at column x — its body
  // centre rides OCTO_SIT above the dune so the arms drape onto the ground.
  const groundY = (x: number) =>
    sandTopAt(clamp(x, 0, k.width() - 1)) - OCTO_SIT;

  const body = k.add([
    k.sprite(cfg.sprite),
    k.pos(k.rand(60 * S, k.width() - 60 * S), k.rand(bandTop(), bandBot())),
    k.anchor("center"),
    k.rotate(0),
    k.scale(1),
    k.z(cfg.z),
  ]);
  // Jellyfish appendages are separate sprites sharing the bell's transform. They
  // stay on their own animation clocks instead of being frozen into bell poses.
  const jellyTendrils =
    cfg.motion === "pulse"
      ? k.add([
          k.sprite("jellyfish-tendrils"),
          k.pos(body.pos.x, body.pos.y),
          k.anchor("center"),
          k.rotate(0),
          k.scale(1),
          k.z(cfg.z - 2),
        ])
      : null;
  const jellyArms =
    cfg.motion === "pulse"
      ? k.add([
          k.sprite("jellyfish-arms"),
          k.pos(body.pos.x, body.pos.y),
          k.anchor("center"),
          k.rotate(0),
          k.scale(1),
          k.z(cfg.z - 1),
        ])
      : null;

  // Nautilus soft parts are independent full-cell layers around one fixed body.
  // Their transparent canvases share the body's anchor, so only animation state
  // changes; attachment geometry and shell identity remain invariant.
  const nautJet =
    cfg.motion === "jet"
      ? k.add([
          k.sprite("nautilus-jet"),
          k.pos(body.pos.x, body.pos.y),
          k.anchor("center"),
          k.rotate(0),
          k.scale(1),
          k.opacity(0),
          k.z(cfg.z - 2),
        ])
      : null;
  const nautSiphon =
    cfg.motion === "jet"
      ? k.add([
          k.sprite("nautilus-siphon"),
          k.pos(body.pos.x, body.pos.y),
          k.anchor("center"),
          k.rotate(0),
          k.scale(1),
          k.z(cfg.z - 1),
        ])
      : null;
  const nautTentacles =
    cfg.motion === "jet"
      ? k.add([
          k.sprite("nautilus-tentacles"),
          k.pos(body.pos.x, body.pos.y),
          k.anchor("center"),
          k.rotate(0),
          k.scale(1),
          // The root cuff sits behind the head; only the free tentacles emerge
          // beyond the mouth folds, concealing the component seam.
          k.z(cfg.z - 0.5),
        ])
      : null;

  let vx = 0;
  let vy = 0;
  let px = body.pos.x;
  let py = cfg.motion === "crawl" ? groundY(px) : body.pos.y; // octopus spawns on the sand
  let ang = 0;
  let facing = k.choose([-1, 1]); // head/eye direction (left-facing sprite)
  const swayPhase = k.rand(0, OCTOPUS_IDLE_FRAMES); // desync the idle arm-sway loop
  let gaitPhase = swayPhase; // crawl reach<->push phase, advanced by distance crawled

  // jet-kind (nautilus) state
  let heading = cfg.motion === "jet" ? -facing : facing;
  let mode: "cruise" | "jet" = cfg.motion === "jet" ? "jet" : "cruise";
  let depth = py;
  let segTimer =
    cfg.motion === "jet"
      ? k.rand(cfg.segJet?.[0] ?? 9, cfg.segJet?.[1] ?? 15)
      : k.rand(cfg.segCruise?.[0] ?? 3, cfg.segCruise?.[1] ?? 6);
  let nautDepthTimer = k.rand(2, 5);
  let jetTimer = 0;
  let nautJetAge = Infinity; // seconds since the last impulse (power → recovery)
  let nautTurnTimer = 0;
  let nautTurnTarget = facing;
  let nautTurnFlipped = false;
  let nautTurnTilt = 1;
  let nautTentacleClock = k.rand(
    0,
    NAUTILUS_LAYER_FRAMES / NAUT_TENTACLE_FPS,
  );

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

  // pulse-kind (jellyfish) state: a 3-phase bell-pump plus independent appendage
  // clocks, a dedicated turn, and the rare startle.
  let pulsePhase: 0 | 1 | 2 = 2; // 0 contract, 1 relax, 2 coast
  let pulseTimer = k.rand(
    cfg.pulse?.coast[0] ?? 0.5,
    cfg.pulse?.coast[1] ?? 1.4,
  );
  let jellyTurnTimer = 0; // dedicated turn state; pauses the pump until complete
  let jellyTurnTarget = facing;
  let jellyTurnFlipped = false;
  let jellyArmsClock = k.rand(0, JELLYFISH_LAYER_FRAMES / JELLY_ARMS_FPS);
  let jellyTendrilClock = k.rand(0, JELLYFISH_LAYER_FRAMES / JELLY_TENDRIL_FPS);
  let flareTimer = 0; // startle wind-up: oral arms flare before the retreat
  let startlePulses = 0; // quick recoil pulses left in the current startle
  let startleTimer = k.rand(
    cfg.pulse?.startle.every[0] ?? 30,
    cfg.pulse?.startle.every[1] ?? 90,
  );
  let jellyTxTimer = 0; // fallback deadline for the current horizontal target
  if (cfg.motion === "pulse") roamTimer = 0; // pick tx and depth on first update

  const artDir = cfg.artDir ?? -1;
  body.flipX = facing !== artDir;
  if (cfg.motion === "jet") {
    body.frame = NAUTILUS_BODY_START;
    nautTentacles!.frame = NAUTILUS_TENTACLES_START;
    nautSiphon!.frame = NAUTILUS_SIPHON_START;
    nautJet!.frame = NAUTILUS_JET_START;
    for (const layer of [nautTentacles!, nautSiphon!, nautJet!])
      layer.flipX = body.flipX;
  }

  const beginTurn = (nf: number) => {
    if (nf === facing) return;
    if (cfg.motion === "jet") {
      nautTurnTarget = nf;
      nautTurnTimer = NAUT_TURN_HOLD;
      nautTurnFlipped = false;
      // Curve toward the current altitude target, falling back to whichever
      // vertical side has more room when the target is nearly level.
      nautTurnTilt =
        Math.abs(depth - py) > 8 * S
          ? depth < py
            ? -1
            : 1
          : py > (bandTop() + bandBot()) / 2
            ? -1
            : 1;
      return;
    }
    facing = nf;
    body.flipX = facing !== artDir;
  };

  // A jellyfish turn is a visible state rather than an immediate flip. The first
  // half rolls in the old direction, flipX changes at midpoint, and the second
  // half settles in the new direction. Pulse timing pauses for the whole turn.
  const requestJellyTurn = (nf: number) => {
    if (nf === facing || (jellyTurnTimer > 0 && nf === jellyTurnTarget)) return;
    jellyTurnTarget = nf;
    jellyTurnTimer = JELLY_TURN_DUR;
    jellyTurnFlipped = false;
  };

  // Nautilus: begin another long course segment. It keeps its current heading
  // most of the time; only walls force an inward turn, with a small chance of a
  // voluntary reversal in open water. Altitude has a separate clock below.
  const startSegment = () => {
    const arms = k.chance(cfg.armsBias ?? 0.5);
    mode = arms ? "cruise" : "jet";
    const edgeZone = 90 * S;
    if (px < edgeZone) heading = 1;
    else if (px > k.width() - edgeZone) heading = -1;
    else if (k.chance(0.12)) heading *= -1;
    segTimer = arms
      ? k.rand(cfg.segCruise![0], cfg.segCruise![1])
      : k.rand(cfg.segJet![0], cfg.segJet![1]);
    const nextFacing = arms ? heading : -heading;
    beginTurn(nextFacing);
    // Propulsion is suppressed by the active turn state; leaving this at zero
    // fires the next pulse exactly when the rotation finishes.
    jetTimer = 0;
  };

  body.onUpdate(() => {
    const dt = k.dt();
    const drag = cfg.drag;
    const mX = 40 * S;
    let allowPitch = true; // crawl forces this off; swim turns it back on
    let buryNow = 0; // octopus: current press-into-sand depth (px), eases to 0
    if (cfg.motion === "jet") {
      nautTurnTimer = Math.max(0, nautTurnTimer - dt);
      nautJetAge += dt;
      if (!nautTurnFlipped && nautTurnTimer <= NAUT_TURN_HOLD * 0.5) {
        facing = nautTurnTarget;
        body.flipX = facing !== artDir;
        for (const layer of [nautTentacles!, nautSiphon!, nautJet!])
          layer.flipX = body.flipX;
        nautTurnFlipped = true;
      }
    }
    if (cfg.motion === "pulse" && jellyTurnTimer > 0) {
      jellyTurnTimer = Math.max(0, jellyTurnTimer - dt);
      if (!jellyTurnFlipped && jellyTurnTimer <= JELLY_TURN_DUR * 0.5) {
        beginTurn(jellyTurnTarget);
        jellyTurnFlipped = true;
      }
    }

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
              px < mX * 2
                ? 1
                : px > k.width() - mX * 2
                  ? -1
                  : k.choose([-1, 1]);
            tx = clamp(
              px + dir * k.rand(60 * S, cr.hop) * tempo,
              mX,
              k.width() - mX,
            );
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
            swimRoamLeft = swimRoaming
              ? k.rand(cr.roamSecs[0], cr.roamSecs[1])
              : 0;
            swimHover = k.rand(cr.roamHover[0], cr.roamHover[1]);
            swimVigorous = swimRoaming || pulsesLeft >= 2; // energetic pose row
            swimDir =
              px < mX * 2
                ? 1
                : px > k.width() - mX * 2
                  ? -1
                  : k.choose([-1, 1]);
            if (swimDir !== facing) curlTimer = 0.4; // curl through the launch turn
            beginTurn(swimDir);
          }
        }
        // ride the sand contour: a P-controller eases py to the seated ground height
        // (offset down by buryNow right after a landing, so it presses in and recovers)
        vy = clamp(
          (groundY(px) + buryNow - py) * 8,
          -cr.speed * 4,
          cr.speed * 4,
        );
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
              const climb = swimRoaming
                ? clamp((py - hoverY) / (30 * S), 0, 1)
                : 1;
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
                  px < mX * 2
                    ? 1
                    : px > k.width() - mX * 2
                      ? -1
                      : k.choose([-1, 1]);
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
            spawnSandPuff(
              k,
              px,
              sandTopAt(clamp(px, 0, k.width() - 1)),
              2,
              2,
              2,
            );
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
      // pulses it sinks slowly (negative buoyancy); the baked pulse-cycle frames
      // track the phase so the pump you see is the push that moves it.
      const p = cfg.pulse!;
      // How much it still needs to climb toward its target depth: 1 = well below
      // (pulse up hard), 0 = at or above it (no lift — just hover and sink). This
      // gates the thrust so the jelly bobs around its depth instead of pulsing
      // against the surface, the way a real medusa coasts once it's high enough.
      const climb = clamp((py - depth) / (40 * S), 0, 1);

      roamTimer -= dt;
      jellyTxTimer -= dt;
      // The horizontal target persists until the jelly actually arrives — it
      // travels only a few px per second, so re-rolling tx on the depth cadence
      // would re-aim it long before it got anywhere (uniform re-rolls from an
      // off-center spot mostly land on the center side, herding every jelly to
      // mid-tank). Arrival re-aims immediately, instead of crossing the old
      // target and reversing thrust while still visibly facing the other way;
      // the long timer is a fallback so one far target can't pin it forever.
      if (Math.abs(tx - px) < 12 * S && jellyTurnTimer <= 0) jellyTxTimer = 0;
      if (roamTimer <= 0 && jellyTurnTimer <= 0) {
        roamTimer = k.rand(p.roam[0], p.roam[1]);
        depth = k.rand(bandTop(), bandBot()); // roam the column
      }
      if (jellyTxTimer <= 0 && jellyTurnTimer <= 0) {
        jellyTxTimer = k.rand(p.roam[0], p.roam[1]) * 5;
        tx = k.rand(mX, k.width() - mX);
        const dir = tx > px ? 1 : -1;
        if (dir !== facing) requestJellyTurn(dir);
      }

      // Rare startle: flare the oral arms mid-coast, then spring away with quick
      // boosted recoil pulses. The flare pauses the pump; its expiry zeroes the
      // coast so the first recoil pulse fires immediately.
      startleTimer -= dt;
      if (
        startleTimer <= 0 &&
        pulsePhase === 2 &&
        startlePulses === 0 &&
        jellyTurnTimer <= 0
      ) {
        flareTimer = JELLY_FLARE;
        startlePulses = 2;
        startleTimer = k.rand(p.startle.every[0], p.startle.every[1]);
      }

      if (flareTimer > 0) {
        flareTimer -= dt;
        if (flareTimer <= 0) pulseTimer = 0;
      } else if (jellyTurnTimer <= 0) {
        pulseTimer -= dt;
        if (pulseTimer <= 0) {
          if (pulsePhase === 2) {
            const willRecoil = startlePulses > 0;
            const away = px > k.width() / 2 ? -1 : 1; // retreat toward open water
            // If a startle needs a reversal, finish the visible turn before firing
            // the recoil. pulseTimer stays at zero and resumes immediately after.
            if (willRecoil && away !== facing) {
              requestJellyTurn(away);
              pulseTimer = 0;
            } else {
              pulsePhase = 0; // coast → contract: the active power stroke
              pulseTimer = p.contract;
              if (willRecoil) {
                startlePulses -= 1;
                vy -= p.thrust * p.startle.boost;
                vx += away * p.thrust * 0.5;
              } else {
                vy -= p.thrust * climb; // only push up as much as it needs to climb
                vx += facing * (p.driftX ?? p.drift); // steer in the visible direction
              }
            }
          } else if (pulsePhase === 0) {
            pulsePhase = 1; // contract → relax: the free passive-recapture push
            pulseTimer = p.relax;
            vy -= p.thrust * p.per * climb;
          } else {
            pulsePhase = 2; // relax → coast — rest longer when it isn't climbing
            pulseTimer =
              startlePulses > 0
                ? 0.22 // barely coast between the recoil pulses
                : k.rand(p.coast[0], p.coast[1]) * (1.6 - climb);
          }
        }
      }

      vy += p.sink * dt; // always sinking a touch; the pulses fight it
      // Bias off the walls only near them — a tank-wide pull would slowly drag
      // every jelly to the center and hold it there.
      const wallZone = mX * 3;
      const wallPush =
        px < wallZone
          ? 1 - px / wallZone
          : px > k.width() - wallZone
            ? -(1 - (k.width() - px) / wallZone)
            : 0;
      vx += wallPush * p.drift * 0.9 * dt;
      allowPitch = false; // upright, radially symmetric
    } else {
      // NAUTILUS: arms-first cruise / tail-first pulse machine.
      nautDepthTimer -= dt;
      if (nautDepthTimer <= 0) {
        // Choose a meaningfully different height instead of repeatedly sampling
        // near the current one. This produces long diagonal ascents/descents
        // without disturbing horizontal heading or tentacle orientation.
        const top = bandTop();
        const bottom = bandBot();
        const middle = (top + bottom) / 2;
        depth =
          py < middle
            ? k.rand(middle + 12 * S, bottom)
            : k.rand(top, middle - 12 * S);
        nautDepthTimer = k.rand(6, 10);
      }
      segTimer -= dt;
      if (segTimer <= 0 && nautTurnTimer <= 0) startSegment();
      // Coast through the visible tilt arc. Thrust resumes only after the turn,
      // avoiding a sideways slide in the new direction.
      if (nautTurnTimer <= 0) {
        if (mode === "cruise") {
          vx += heading * cfg.cruise! * drag * dt; // equilibrium ≈ cruise
        } else {
          jetTimer -= dt;
          if (jetTimer <= 0) {
            jetTimer = k.rand(cfg.jet!.interval[0], cfg.jet!.interval[1]);
            vx += heading * cfg.jet!.impulse;
            const v = cfg.jet!.impulse * cfg.jet!.vert;
            vy += clamp((depth - py) * 1.5, -v, v);
            nautJetAge = 0;
          }
        }
      } else {
        // Shed the old horizontal momentum while rotating edge-on. The new jet
        // then establishes the new course instead of the sprite sliding briefly
        // in the direction it has just turned away from.
        vx -= vx * 2.8 * dt;
      }
      vy += clamp((depth - py) * 1.1, -18 * S, 18 * S) * dt;
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
      const jellyTilt = clamp(vx / (12 * S), -1, 1) * 4; // poses already carry directional lean
      ang += (jellyTilt - ang) * (1 - Math.exp(-2.5 * dt));
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
    body.angle =
      cfg.motion === "crawl"
        ? Math.round(ang / TILT_STEP) * TILT_STEP
        : ang; // hovering creatures ease continuously rather than ticking by 7°

    // Jellyfish: the bell follows the propulsion phase while the two appendage
    // rows run continuously and independently. All three share one transform;
    // only the appendage attachment offset follows the bell's lower rim.
    if (cfg.motion === "pulse") {
      const p = cfg.pulse!;
      const tightFrame = JELLYFISH_LAYER_FRAMES / 2;
      let bellFrame = 0;
      if (pulsePhase === 0) {
        const t = 1 - pulseTimer / p.contract;
        bellFrame = Math.min(
          tightFrame,
          Math.floor(clamp(t, 0, 1) * (tightFrame + 1)),
        );
      } else if (pulsePhase === 1) {
        const t = 1 - pulseTimer / p.relax;
        bellFrame =
          tightFrame +
          Math.min(
            JELLYFISH_LAYER_FRAMES - tightFrame - 1,
            Math.floor(clamp(t, 0, 1) * (JELLYFISH_LAYER_FRAMES - tightFrame)),
          );
      }
      body.frame = JELLYFISH_BELL_START + bellFrame;

      jellyArmsClock += dt;
      jellyTendrilClock += dt;
      const armsFrame =
        Math.floor(jellyArmsClock * JELLY_ARMS_FPS) % JELLYFISH_LAYER_FRAMES;
      const tendrilFrame =
        Math.floor(jellyTendrilClock * JELLY_TENDRIL_FPS) % JELLYFISH_LAYER_FRAMES;
      jellyArms!.frame = JELLYFISH_ARMS_START + armsFrame;
      jellyTendrils!.frame = JELLYFISH_TENDRILS_START + tendrilFrame;
      // The startle wind-up spreads only the oral arms; their wave clock keeps
      // advancing, and the long tendrils remain completely unaffected.
      jellyArms!.scale.x =
        1 +
        (flareTimer > 0
          ? 0.12 * Math.sin((Math.PI * flareTimer) / JELLY_FLARE)
          : 0);

      const attachOffset =
        JELLYFISH_BELL_ATTACH_Y[bellFrame] - JELLYFISH_LAYER_ROOT_Y;
      const radians = (body.angle * Math.PI) / 180;
      const ox = -Math.sin(radians) * attachOffset;
      const oy = Math.cos(radians) * attachOffset;
      for (const layer of [jellyTendrils!, jellyArms!]) {
        layer.pos.x = body.pos.x + ox;
        layer.pos.y = body.pos.y + oy;
        layer.angle = body.angle;
        layer.flipX = body.flipX;
      }
    }

    // Nautilus: the body never changes frame. Tentacles keep travelling on their
    // own clock, while the siphon anticipates each pulse and the water plume plays
    // once through the power/recovery interval. A turn follows a visible in-plane
    // arc: tilt toward vertical, change facing at the apex, then settle upright.
    if (cfg.motion === "jet") {
      body.frame = NAUTILUS_BODY_START;
      nautTentacleClock += dt;
      const tentacleFrame =
        Math.floor(nautTentacleClock * NAUT_TENTACLE_FPS) %
        NAUTILUS_LAYER_FRAMES;
      nautTentacles!.frame = NAUTILUS_TENTACLES_START + tentacleFrame;

      const turnProgress =
        nautTurnTimer > 0 ? 1 - nautTurnTimer / NAUT_TURN_HOLD : 0;
      const easedTurn = turnProgress * turnProgress * (3 - 2 * turnProgress);
      const tuck = nautTurnTimer > 0 ? Math.sin(Math.PI * easedTurn) : 0;
      const turnAngle = nautTurnTilt * 82 * tuck;
      body.angle = ang + turnAngle;
      body.scale.x = 1;
      body.scale.y = 1;
      nautTentacles!.scale.x = 1;
      nautTentacles!.scale.y = 1;
      nautSiphon!.scale.x = 1;
      nautSiphon!.scale.y = 1;
      nautJet!.scale.x = 1;
      nautJet!.scale.y = 1;

      let siphonExtension = 0;
      if (mode === "jet" && nautTurnTimer <= 0) {
        if (nautJetAge < NAUT_JET_POWER) siphonExtension = 1;
        else if (nautJetAge < NAUT_JET_RECOVER)
          siphonExtension =
            1 -
            (nautJetAge - NAUT_JET_POWER) /
              (NAUT_JET_RECOVER - NAUT_JET_POWER);
        else if (jetTimer < NAUT_JET_ANTICIPATE)
          siphonExtension = 1 - jetTimer / NAUT_JET_ANTICIPATE;
      }
      const siphonFrame = Math.round(
        clamp(siphonExtension, 0, 1) * (NAUTILUS_LAYER_FRAMES - 1),
      );
      nautSiphon!.frame = NAUTILUS_SIPHON_START + siphonFrame;

      if (mode === "jet" && nautTurnTimer <= 0 && nautJetAge < NAUT_JET_RECOVER) {
        const plumeProgress = clamp(nautJetAge / NAUT_JET_RECOVER, 0, 1);
        nautJet!.frame =
          NAUTILUS_JET_START +
          Math.min(
            NAUTILUS_LAYER_FRAMES - 1,
            Math.floor(plumeProgress * NAUTILUS_LAYER_FRAMES),
          );
        nautJet!.opacity = 1;
      } else {
        nautJet!.frame = NAUTILUS_JET_START;
        nautJet!.opacity = 0;
      }

      for (const layer of [nautJet!, nautSiphon!, nautTentacles!]) {
        layer.pos.x = body.pos.x;
        layer.pos.y = body.pos.y;
        layer.angle = body.angle;
        layer.flipX = body.flipX;
      }
    }

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
        else if (swimSub === "gather")
          frame = P.activeCrawlReach; // reaching push-off
        else if (swimSub === "thrust")
          frame = swimVigorous ? P.activeSwimPulse : P.swimPulse;
        else if (swimSub === "glide")
          frame = swimVigorous ? P.activeGlide : P.glide;
        // settle: hold the glide pose through the final sink, then brace with the
        // second crawl pose only very-very close to touchdown.
        else if (py < groundY(px) - OCTO_LAND_POSE)
          frame = swimVigorous ? P.activeGlide : P.glide;
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

  });

  return body;
}
