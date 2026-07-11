// Sea snail (nudibranch): a small, slow benthic crawler. It wanders the whole
// local bed (substrate.ts) — every sand column between the dune crest and the
// bottom margin. The pose cycle advances by total distance travelled, so its
// muscular foot wave cannot slide while stationary.
import type { KAPLAYCtx } from "kaplay";
import { groundZ, sandTopAt } from "./backdrop";
import { SEA_SNAIL_GROUND_OFFSET } from "./seaSnailAtlas";
import { RES } from "./res";
import { spawnSandPuff } from "./sandPuff";
import { profile, profileDraw, profileDrawEnd } from "./profiling";
import { chooseSubstrateDepth, maxSubstrateDepthAt } from "./substrate";
import {
  clampPathX,
  getPropObstacles,
  insidePropFootprint,
  nearestClearX,
} from "./propPlacement";

const S = RES;
const FRAMES = 6;
const HALF = 30;
const STANDOFF = 2 * S; // stop points land strictly clear of a footprint
// Wall margin: just keeps the body on-screen. Props near the walls are handled
// by the obstacle system, not by widening this.
const EDGE = 12 * S;
// Only force an inward turn within this of a wall, so the snail lingers on the
// near-wall dune instead of bouncing back the moment it approaches.
const TURN_MARGIN = 22 * S;
const MIN_TRIP = 35 * S;
const MAX_TRIP = 125 * S;
const FRAME_STEP = 1.6 * S;
const SLOPE_SPAN = 17 * S;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function spawnSeaSnail(k: KAPLAYCtx) {
  let x = k.rand(EDGE, k.width() - EDGE);
  let substrateDepth = chooseSubstrateDepth(k, x);
  x = nearestClearX(x, HALF, STANDOFF, substrateDepth, EDGE, k.width() - EDGE);
  let facing = k.choose([-1, 1]);
  let targetX = x;
  let targetDepth = substrateDepth;
  let rest = k.rand(0.8, 3.5);
  let gaitDistance = k.rand(0, FRAMES * FRAME_STEP);
  let lastX = x;
  let lastDepth = substrateDepth;
  let puffDistance = 0;
  let nextPuffDistance = k.rand(2.5, 4) * S;
  let angle = 0;
  let seenObstacles = getPropObstacles();
  const speed = k.rand(3.5, 5.5) * S;

  const groundCentreY = (atX: number, depth: number) =>
    sandTopAt(clamp(atX, 0, k.width() - 1)) - SEA_SNAIL_GROUND_OFFSET + depth;

  const baseY = (atX: number, depth: number) =>
    sandTopAt(clamp(atX, 0, k.width() - 1)) + depth;

  const snail = k.add([
    profileDraw("snails"),
    k.sprite("sea-snail"),
    profileDrawEnd(),
    k.pos(x, groundCentreY(x, substrateDepth)),
    k.anchor("center"),
    k.rotate(0),
    k.z(groundZ(baseY(x, substrateDepth))),
  ]);
  snail.frame = 0;
  snail.flipX = facing > 0; // source art faces left

  const chooseTrip = () => {
    const dir =
      x < EDGE + TURN_MARGIN
        ? 1
        : x > k.width() - EDGE - TURN_MARGIN
          ? -1
          : k.chance(0.82)
            ? facing
            : -facing;
    facing = dir;
    snail.flipX = facing > 0;
    targetX = clamp(
      x + dir * k.rand(MIN_TRIP, MAX_TRIP),
      EDGE,
      k.width() - EDGE,
    );
    targetDepth = chooseSubstrateDepth(k, targetX, substrateDepth);
    targetX = clampPathX(
      x,
      targetX,
      HALF,
      STANDOFF,
      substrateDepth,
      targetDepth,
    );
    if (Math.abs(targetX - x) < 6 * S) {
      facing = -facing;
      snail.flipX = facing > 0;
      targetX = clamp(
        x + facing * k.rand(MIN_TRIP, MAX_TRIP),
        EDGE,
        k.width() - EDGE,
      );
      targetX = clampPathX(
        x,
        targetX,
        HALF,
        STANDOFF,
        substrateDepth,
        targetDepth,
      );
    }
    // A clamp may have landed the stop where the bed is thinner than the
    // chosen depth; keep the target inside the local bed.
    targetDepth = Math.min(targetDepth, maxSubstrateDepthAt(targetX));
  };

  snail.onUpdate(() =>
    profile("snails", () => {
      const dt = k.dt();
      if (seenObstacles !== getPropObstacles()) {
        seenObstacles = getPropObstacles();
        if (insidePropFootprint(x, HALF, substrateDepth)) {
          targetX = nearestClearX(
            x,
            HALF,
            STANDOFF,
            substrateDepth,
            EDGE,
            k.width() - EDGE,
          );
          targetDepth = substrateDepth;
          facing = targetX > x ? 1 : -1;
          snail.flipX = facing > 0;
          rest = 0;
        } else {
          targetX = clampPathX(
            x,
            targetX,
            HALF,
            STANDOFF,
            substrateDepth,
            targetDepth,
          );
        }
      }
      if (rest > 0) {
        rest -= dt;
        snail.frame = 0;
        if (rest <= 0) chooseTrip();
      } else {
        const remainingX = targetX - x;
        const remainingDepth = targetDepth - substrateDepth;
        const remaining = Math.hypot(remainingX, remainingDepth);
        const step = Math.min(remaining, speed * dt);
        const ratio = remaining > 0 ? step / remaining : 0;
        x += remainingX * ratio;
        substrateDepth += remainingDepth * ratio;
        // Both trip endpoints fit their local bed, but the straight line between
        // them can dip below it where the crest falls away mid-trip; ride the
        // bottom margin there instead.
        substrateDepth = Math.min(substrateDepth, maxSubstrateDepthAt(x));
        const travelled = Math.hypot(x - lastX, substrateDepth - lastDepth);
        gaitDistance += travelled;
        puffDistance += travelled;
        lastX = x;
        lastDepth = substrateDepth;
        snail.frame = Math.floor(gaitDistance / FRAME_STEP) % FRAMES;
        if (puffDistance >= nextPuffDistance) {
          spawnSandPuff(
            k,
            x - facing * 8 * S,
            sandTopAt(clamp(x, 0, k.width() - 1)) + substrateDepth,
            0.34,
            0.5,
            2.8,
            1,
          );
          puffDistance = 0;
          nextPuffDistance = k.rand(2.5, 4) * S;
        }
        if (remaining <= 0.35 * S) {
          x = targetX;
          substrateDepth = targetDepth;
          lastX = x;
          lastDepth = substrateDepth;
          snail.frame = 0;
          rest = k.chance(0.15) ? k.rand(6, 13) : k.rand(0.8, 3.5);
        }
      }

      snail.pos.x = x;
      snail.pos.y = groundCentreY(x, substrateDepth);
      snail.z = groundZ(baseY(x, substrateDepth));
      const left = sandTopAt(clamp(x - SLOPE_SPAN, 0, k.width() - 1));
      const right = sandTopAt(clamp(x + SLOPE_SPAN, 0, k.width() - 1));
      const desired = clamp(
        (Math.atan2(right - left, SLOPE_SPAN * 2) * 180) / Math.PI,
        -5,
        5,
      );
      angle += (desired - angle) * Math.min(1, dt * 2.5);
      snail.angle = angle;
    }),
  );

  return snail;
}
