// Hermit crab: a strictly benthic crawler. Its horizontal travel drives the
// six-pose gait, while its centre follows the same dune contour used to paint
// the sand. Stops are real stops (one stable frame), so the legs never paddle
// while the animal is parked.
import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { HERMIT_CRAB_GROUND_OFFSET } from "./hermitCrabAtlas";
import { RES } from "./res";

const S = RES;
const FRAMES = 6;
const CRAB_SCALE = 0.5;
const EDGE = 62 * S;
const MIN_TRIP = 55 * S;
const MAX_TRIP = 190 * S;
const FRAME_STEP = 2.2 * S; // travelled pixels per gait pose
const SLOPE_SPAN = 20 * S;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function spawnHermitCrab(k: KAPLAYCtx) {
  let x = k.rand(EDGE, k.width() - EDGE);
  let facing = k.choose([-1, 1]);
  let targetX = x;
  let rest = k.rand(1.5, 5);
  let gaitDistance = k.rand(0, FRAMES * FRAME_STEP);
  let lastX = x;
  let angle = 0;
  const speed = k.rand(10, 15) * S;

  const groundCentreY = (atX: number) =>
    sandTopAt(clamp(atX, 0, k.width() - 1)) -
    HERMIT_CRAB_GROUND_OFFSET * CRAB_SCALE;

  const crab = k.add([
    k.sprite("hermit-crab"),
    k.pos(x, groundCentreY(x)),
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
  };

  crab.onUpdate(() => {
    const dt = k.dt();
    if (rest > 0) {
      rest -= dt;
      crab.frame = 1;
      if (rest <= 0) chooseTrip();
    } else {
      const remaining = targetX - x;
      const step = Math.sign(remaining) * Math.min(Math.abs(remaining), speed * dt);
      x += step;
      gaitDistance += Math.abs(x - lastX);
      lastX = x;
      crab.frame = Math.floor(gaitDistance / FRAME_STEP) % FRAMES;

      if (Math.abs(targetX - x) < 0.5 * S) {
        x = targetX;
        crab.frame = 1;
        // Most pauses are brief foraging stops; occasionally it settles for a
        // longer spell, which keeps the bottom life from feeling clockwork.
        rest = k.chance(0.18) ? k.rand(9, 20) : k.rand(2.5, 7.5);
      }
    }

    crab.pos.x = x;
    crab.pos.y = groundCentreY(x);

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
