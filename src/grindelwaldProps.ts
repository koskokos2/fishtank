import { GRINDELWALD_PROPS_ATLAS_LAYOUT } from "./grindelwaldPropsAtlas";

export type GrindelwaldPropName = keyof typeof GRINDELWALD_PROPS_ATLAS_LAYOUT;

export type GrindelwaldPropSpec = {
  name: GrindelwaldPropName;
  fx: number;
  depth: number;
};

// All twelve Alpine relics join the rotating seabed pool. The nominal
// positions and burial depths document their intended spread when previewed as
// a full family; the shared runtime rotation assigns the actual visible slots.
export const GRINDELWALD_PROP_SPECS: GrindelwaldPropSpec[] = [
  { name: "edelweiss_stone_cluster", fx: 0.04, depth: 18 },
  { name: "wetterhorn_cable_car", fx: 0.125, depth: 38 },
  { name: "schynige_platte_carriage", fx: 0.21, depth: 25 },
  { name: "eiger_relief_plaque", fx: 0.295, depth: 44 },
  { name: "alpine_hiking_signpost", fx: 0.38, depth: 20 },
  { name: "ornate_alpine_cowbell", fx: 0.465, depth: 36 },
  { name: "edelweiss_milk_churn", fx: 0.55, depth: 28 },
  { name: "chalet_gable_fragment", fx: 0.635, depth: 50 },
  { name: "ice_axe_rope_bundle", fx: 0.72, depth: 22 },
  { name: "vintage_wooden_skis", fx: 0.805, depth: 42 },
  { name: "fondue_caquelon", fx: 0.89, depth: 30 },
  { name: "full_alpenhorn", fx: 0.97, depth: 46 },
];
