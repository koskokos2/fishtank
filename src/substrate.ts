// The walkable substrate for benthic crawlers (hermit crab, sea snail): every
// sand column between the dune crest and a screen-wide bottom margin. Depth is
// measured below the local crest, so the budget varies with the contour — a
// thin bed on the flat right, the whole tall dune face in the left corner.
// Props are the only carve-outs (propPlacement.ts).
import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { RES, VH } from "./res";

const S = RES;
const BOTTOM_MARGIN = 15 * S;
// Trips should read as a lane change, not a wobble, so a new depth keeps at
// least this far from the current one when the local bed allows it.
const MIN_DEPTH_CHANGE = 8 * S;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export const maxSubstrateDepthAt = (x: number) =>
  Math.max(0, VH - BOTTOM_MARGIN - sandTopAt(x));

export function chooseSubstrateDepth(
  k: KAPLAYCtx,
  atX: number,
  awayFrom?: number,
): number {
  const max = maxSubstrateDepthAt(atX);
  if (awayFrom !== undefined) {
    // Sample uniformly from [0, max] minus the band around the current depth.
    const lo = clamp(awayFrom - MIN_DEPTH_CHANGE, 0, max);
    const hi = clamp(awayFrom + MIN_DEPTH_CHANGE, 0, max);
    const span = lo + (max - hi);
    if (span > 0) {
      const u = k.rand(0, span);
      return u < lo ? u : hi + (u - lo);
    }
  }
  return k.rand(0, max);
}
