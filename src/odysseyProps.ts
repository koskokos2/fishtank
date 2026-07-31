import { ODYSSEY_PROPS_ATLAS_LAYOUT } from "./odysseyPropsAtlas";

export type OdysseyPropName = keyof typeof ODYSSEY_PROPS_ATLAS_LAYOUT;

export type OdysseyPropSpec = {
  name: OdysseyPropName;
  fx: number;
  depth: number;
};

// All twelve relics join the rotating seabed pool. The nominal positions and
// burial depths document their intended spread when previewed as a full family;
// the shared runtime rotation assigns the actual visible slots.
export const ODYSSEY_PROP_SPECS: OdysseyPropSpec[] = [
  { name: "wine_dark_amphora", fx: 0.04, depth: 18 },
  { name: "siren_wax_and_rope", fx: 0.125, depth: 38 },
  { name: "aeolus_wind_bag", fx: 0.21, depth: 25 },
  { name: "moly_herb_dish", fx: 0.295, depth: 44 },
  { name: "circe_golden_cup", fx: 0.38, depth: 20 },
  { name: "lotus_eater_bloom", fx: 0.465, depth: 36 },
  { name: "cyclops_cave_stone", fx: 0.55, depth: 28 },
  { name: "siren_broken_mast", fx: 0.635, depth: 50 },
  { name: "penelope_loom_shuttle", fx: 0.72, depth: 22 },
  { name: "trojan_war_helmet", fx: 0.805, depth: 42 },
  { name: "ithacan_bow", fx: 0.89, depth: 30 },
  { name: "poseidon_trident_fragment", fx: 0.97, depth: 46 },
];
