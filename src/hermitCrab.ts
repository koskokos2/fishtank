// Hermit crab: a strictly benthic crawler. Its travelled distance drives the
// six-pose gait, while its centre follows the dune contour plus a changing
// substrate depth. This lets it wander through the back, middle, and foreground
// tiers occupied by the seabed props instead of tracing only the sand crest. Stops are
// real stops (one stable frame), so the legs never paddle while it is parked.
import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { HERMIT_CRAB_GROUND_OFFSET } from "./hermitCrabAtlas";
import { RES } from "./res";
import { spawnSandPuff } from "./sandPuff";

const S = RES;
const FRAMES = 6;
const CRAB_SCALE = 0.5;
const EDGE = 62 * S;
const MIN_TRIP = 55 * S;
const MAX_TRIP = 190 * S;
const FRAME_STEP = 2.2 * S; // travelled pixels per gait pose
const SLOPE_SPAN = 20 * S;
// These match the three prop-placement bands in backdrop.ts. A little jitter
// prevents the crab from revealing them as three perfectly mechanical lanes.
const DEPTH_TIERS = [2, 17, 38].map((depth) => depth * S);
const DEPTH_JITTER = 3 * S;
const MAX_DEPTH = 43 * S;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const chooseOtherDepthTier = (k: KAPLAYCtx, currentDepth: number) => {
  const alternatives = DEPTH_TIERS.filter(
    (tier) => Math.abs(tier - currentDepth) > 8 * S,
  );
  return clamp(
    k.choose(alternatives) + k.rand(-DEPTH_JITTER, DEPTH_JITTER),
    0,
    MAX_DEPTH,
  );
};

export function spawnHermitCrab(k: KAPLAYCtx, startX?: number) {
  let x = clamp(startX ?? k.rand(EDGE, k.width() - EDGE), EDGE, k.width() - EDGE);
  let substrateDepth = clamp(
    k.choose(DEPTH_TIERS) + k.rand(-DEPTH_JITTER, DEPTH_JITTER),
    0,
    MAX_DEPTH,
  );
  let facing = k.choose([-1, 1]);
  let targetX = x;
  let targetDepth = substrateDepth;
  let rest = k.rand(1.5, 5);
  let gaitDistance = k.rand(0, FRAMES * FRAME_STEP);
  let lastX = x;
  let lastDepth = substrateDepth;
  let puffDistance = 0;
  let nextPuffDistance = k.rand(7, 11) * S;
  let angle = 0;
  const speed = k.rand(10, 15) * S;

  const groundCentreY = (atX: number, depth: number) =>
    sandTopAt(clamp(atX, 0, k.width() - 1)) -
    HERMIT_CRAB_GROUND_OFFSET * CRAB_SCALE +
    depth;

  const crab = k.add([
    k.sprite("hermit-crab"),
    k.pos(x, groundCentreY(x, substrateDepth)),
    k.anchor("center"),
    k.rotate(0),
    k.scale(CRAB_SCALE),
    k.z(17),
  ]);
  crab.frame = 1;
  crab.flipX = facing > 0; // source art faces left

  const chooseTrip = () => {
    // Continue in the same direction more often than reversing; walls always
    // send it inward. A reversal happens only after the current rest, avoiding
    // a visible one-frame flip in the middle of a stride.
    const dir =
      x < EDGE + MIN_TRIP
        ? 1
        : x > k.width() - EDGE - MIN_TRIP
          ? -1
          : k.chance(0.72)
            ? facing
            : -facing;
    facing = dir;
    crab.flipX = facing > 0;
    targetX = clamp(
      x + dir * k.rand(MIN_TRIP, MAX_TRIP),
      EDGE,
      k.width() - EDGE,
    );
    targetDepth = chooseOtherDepthTier(k, substrateDepth);
  };

  crab.onUpdate(() => {
    const dt = k.dt();
    if (rest > 0) {
      rest -= dt;
      crab.frame = 1;
      if (rest <= 0) chooseTrip();
    } else {
      const remainingX = targetX - x;
      const remainingDepth = targetDepth - substrateDepth;
      const remaining = Math.hypot(remainingX, remainingDepth);
      const step = Math.min(remaining, speed * dt);
      const ratio = remaining > 0 ? step / remaining : 0;
      x += remainingX * ratio;
      substrateDepth += remainingDepth * ratio;
      const travelled = Math.hypot(x - lastX, substrateDepth - lastDepth);
      gaitDistance += travelled;
      puffDistance += travelled;
      lastX = x;
      lastDepth = substrateDepth;
      crab.frame = Math.floor(gaitDistance / FRAME_STEP) % FRAMES;

      if (puffDistance >= nextPuffDistance) {
        spawnSandPuff(
          k,
          x - facing * 6 * S,
          sandTopAt(clamp(x, 0, k.width() - 1)) + substrateDepth,
          0.28,
          0.58,
          2.2,
        );
        puffDistance = 0;
        nextPuffDistance = k.rand(7, 11) * S;
      }

      if (remaining <= 0.5 * S) {
        x = targetX;
        substrateDepth = targetDepth;
        lastX = x;
        lastDepth = substrateDepth;
        crab.frame = 1;
        // Most pauses are brief foraging stops; occasionally it settles for a
        // longer spell, which keeps the bottom life from feeling clockwork.
        rest = k.chance(0.18) ? k.rand(9, 20) : k.rand(2.5, 7.5);
      }
    }

    crab.pos.x = x;
    crab.pos.y = groundCentreY(x, substrateDepth);

    // Lean very slightly with the broad dune slope. The large sampling span
    // ignores single-pixel sand chop, and easing keeps the heavy shell steady.
    const left = sandTopAt(clamp(x - SLOPE_SPAN, 0, k.width() - 1));
    const right = sandTopAt(clamp(x + SLOPE_SPAN, 0, k.width() - 1));
    const desired = clamp(
      (Math.atan2(right - left, SLOPE_SPAN * 2) * 180) / Math.PI,
      -6,
      6,
    );
    angle += (desired - angle) * Math.min(1, dt * 3);
    crab.angle = angle;
  });

  return crab;
}
