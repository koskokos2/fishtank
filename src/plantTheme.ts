import * as normal from "./plantAtlas";
import * as goth from "./gothPlantAtlas";
import { gothPlantsEnabled } from "./profiling";

// Both sheets share semantic component names and frame order. Only source art
// and measured bounds change; the tank keeps one plant field and animation path.
export function getPlantTheme(useGoth: boolean) {
  return useGoth
    ? {
        src: goth.GOTH_PLANT_ATLAS,
        cell: goth.GOTH_PLANT_ATLAS_CELL,
        cols: goth.GOTH_PLANT_ATLAS_COLS,
        rows: goth.GOTH_PLANT_ATLAS_ROWS,
        layout: goth.GOTH_PLANT_ATLAS_LAYOUT,
      }
    : {
        src: normal.PLANT_ATLAS,
        cell: normal.PLANT_ATLAS_CELL,
        cols: normal.PLANT_ATLAS_COLS,
        rows: normal.PLANT_ATLAS_ROWS,
        layout: normal.PLANT_ATLAS_LAYOUT,
      };
}

export const {
  src: PLANT_ATLAS,
  cell: PLANT_ATLAS_CELL,
  cols: PLANT_ATLAS_COLS,
  rows: PLANT_ATLAS_ROWS,
  layout: PLANT_ATLAS_LAYOUT,
} = getPlantTheme(gothPlantsEnabled);
