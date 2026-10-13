import * as normal from "./hermitCrabAtlas";
import * as hands from "./crawlingHandAtlas";
import { crawlingHandsEnabled } from "./profiling";

// Both skins use the existing distance-driven six-pose crawl and frame 1 idle.
// Their measured ground offsets keep feet or fingertips on the same substrate.
// Distinct sprite names keep both decoded atlases available for live switching.
export function getCrabTheme(useHands: boolean) {
  return useHands
    ? {
        sprite: "crawling-hand",
        src: hands.CRAWLING_HAND_ATLAS,
        frames: hands.CRAWLING_HAND_FRAMES,
        tile: hands.CRAWLING_HAND_TILE,
        groundOffset: hands.CRAWLING_HAND_GROUND_OFFSET,
      }
    : {
        sprite: "hermit-crab",
        src: normal.HERMIT_CRAB_ATLAS,
        frames: normal.HERMIT_CRAB_FRAMES,
        tile: normal.HERMIT_CRAB_TILE,
        groundOffset: normal.HERMIT_CRAB_GROUND_OFFSET,
      };
}

export const {
  src: HERMIT_CRAB_ATLAS,
  frames: HERMIT_CRAB_FRAMES,
  groundOffset: HERMIT_CRAB_GROUND_OFFSET,
} = getCrabTheme(crawlingHandsEnabled);
