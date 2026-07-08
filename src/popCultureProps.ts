import { POP_CULTURE_PROPS_ATLAS_LAYOUT } from "./popCulturePropsAtlas";

export type PopCulturePropName = keyof typeof POP_CULTURE_PROPS_ATLAS_LAYOUT;

export type PopCulturePropSpec = {
  name: PopCulturePropName;
  fx: number;
  depth: number;
};

// Twelve tiny tribute props, kept code-generic so the scene reads as a playful
// lost-and-found shelf without hardcoding franchise names into the runtime API.
export const POP_CULTURE_PROP_SPECS: PopCulturePropSpec[] = [
  { name: "prism_album_plaque", fx: 0.04, depth: 28 },
  { name: "glowing_inscription_ring", fx: 0.125, depth: 48 },
  { name: "blue_crystal_d20", fx: 0.21, depth: 23 },
  { name: "five_inch_floppy", fx: 0.295, depth: 54 },
  { name: "quiet_spy_pistol", fx: 0.38, depth: 30 },
  { name: "batwing_throwing_blade", fx: 0.465, depth: 45 },
  { name: "retro_robot_head", fx: 0.55, depth: 26 },
  { name: "brass_genie_lamp", fx: 0.635, depth: 56 },
  { name: "time_dash_clock", fx: 0.72, depth: 36 },
  { name: "companion_love_cube", fx: 0.805, depth: 51 },
  { name: "classic_candybar_phone", fx: 0.89, depth: 24 },
  { name: "green_portal_projector", fx: 0.97, depth: 42 },
];
