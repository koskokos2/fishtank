import { HALLOWEEN_PROPS_ATLAS_LAYOUT } from "./halloweenPropsAtlas";

export type HalloweenPropName = keyof typeof HALLOWEEN_PROPS_ATLAS_LAYOUT;

export type HalloweenPropSpec = {
  name: HalloweenPropName;
  fx: number;
  depth: number;
};

// All twelve ornaments join the shared rotating seabed pool. Positions and
// depths describe the full-family preview; runtime rotation assigns slots.
export const HALLOWEEN_PROP_SPECS: HalloweenPropSpec[] = [
  { name: "jack_o_lantern", fx: 0.04, depth: 22 },
  { name: "crooked_gravestone", fx: 0.125, depth: 42 },
  { name: "witch_cauldron", fx: 0.21, depth: 28 },
  { name: "ghost_lantern", fx: 0.295, depth: 48 },
  { name: "skull_and_bones", fx: 0.38, depth: 18 },
  { name: "vampire_coffin", fx: 0.465, depth: 38 },
  { name: "witch_hat_and_broom", fx: 0.55, depth: 26 },
  { name: "melting_candles", fx: 0.635, depth: 50 },
  { name: "haunted_house", fx: 0.72, depth: 20 },
  { name: "moon_potion_bottle", fx: 0.805, depth: 44 },
  { name: "cemetery_gate", fx: 0.89, depth: 30 },
  { name: "pumpkin_candy_bucket", fx: 0.97, depth: 46 },
];
