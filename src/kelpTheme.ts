import * as normal from "./luminousKelpAtlas";
import * as goth from "./gothKelpAtlas";
import { gothKelpEnabled } from "./profiling";

// The same articulated grove consumes either skin. Frame names, hinge placement
// and attachment directions match; each skin supplies its measured stem tips.
export function getKelpTheme(useGoth: boolean) {
  return useGoth
    ? {
        src: goth.GOTH_KELP_ATLAS,
        cols: goth.GOTH_KELP_COLS,
        rows: goth.GOTH_KELP_ROWS,
        tile: goth.GOTH_KELP_TILE,
        parts: goth.GOTH_KELP_PART,
        tips: goth.GOTH_KELP_TIP,
      }
    : {
        src: normal.LUMINOUS_KELP_ATLAS,
        cols: normal.LUMINOUS_KELP_COLS,
        rows: normal.LUMINOUS_KELP_ROWS,
        tile: normal.LUMINOUS_KELP_TILE,
        parts: normal.LUMINOUS_KELP_PART,
        tips: normal.LUMINOUS_KELP_TIP,
      };
}

export const {
  src: LUMINOUS_KELP_ATLAS,
  cols: LUMINOUS_KELP_COLS,
  rows: LUMINOUS_KELP_ROWS,
  parts: LUMINOUS_KELP_PART,
  tips: LUMINOUS_KELP_TIP,
} = getKelpTheme(gothKelpEnabled);
