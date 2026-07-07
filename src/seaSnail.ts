// Sea snail (nudibranch): a small, slow benthic crawler. The pose cycle advances
// by distance travelled, so its muscular foot wave cannot slide while stationary.
import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { SEA_SNAIL_GROUND_OFFSET } from "./seaSnailAtlas";
import { RES } from "./res";

const S = RES;
const FRAMES = 6;
const EDGE = 38 * S;
const MIN_TRIP = 35 * S;
const MAX_TRIP = 125 * S;
const FRAME_STEP = 1.6 * S;
const SLOPE_SPAN = 17 * S;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function spawnSeaSnail(k: KAPLAYCtx) {
  let x = k.rand(EDGE, k.width() - EDGE);
  let facing = k.choose([-1, 1]);
  let targetX = x;
  let rest = k.rand(0.8, 3.5);
  let gaitDistance = k.rand(0, FRAMES * FRAME_STEP);
  let lastX = x;
  let angle = 0;
  const speed = k.rand(3.5, 5.5) * S;

  const groundCentreY = (atX: number) =>
    sandTopAt(clamp(atX, 0, k.width() - 1)) - SEA_SNAIL_GROUND_OFFSET;

  const snail = k.add([
    k.sprite("sea-snail"),
    k.pos(x, groundCentreY(x)),
    k.anchor("center"),
    k.rotate(0),
    k.z(16.5),
  ]);
  snail.frame = 0;
  snail.flipX = facing > 0; // source art faces left

  const chooseTrip = () => {
    const dir =
      x < EDGE + MIN_TRIP
        ? 1
        : x > k.width() - EDGE - MIN_TRIP
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
  };

  snail.onUpdate(() => {
    const dt = k.dt();
    if (rest > 0) {
      rest -= dt;
      snail.frame = 0;
      if (rest <= 0) chooseTrip();
    } else {
      const remaining = targetX - x;
      x += Math.sign(remaining) * Math.min(Math.abs(remaining), speed * dt);
      gaitDistance += Math.abs(x - lastX);
      lastX = x;
      snail.frame = Math.floor(gaitDistance / FRAME_STEP) % FRAMES;
      if (Math.abs(targetX - x) < 0.35 * S) {
        x = targetX;
        snail.frame = 0;
        rest = k.chance(0.15) ? k.rand(6, 13) : k.rand(0.8, 3.5);
      }
    }

    snail.pos.x = x;
    snail.pos.y = groundCentreY(x);
    const left = sandTopAt(clamp(x - SLOPE_SPAN, 0, k.width() - 1));
    const right = sandTopAt(clamp(x + SLOPE_SPAN, 0, k.width() - 1));
    const desired = clamp(
      (Math.atan2(right - left, SLOPE_SPAN * 2) * 180) / Math.PI,
      -5,
      5,
    );
    angle += (desired - angle) * Math.min(1, dt * 2.5);
    snail.angle = angle;
  });

  return snail;
}
