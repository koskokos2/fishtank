import { GIGER_PROPS_ATLAS_LAYOUT } from "./gigerPropsAtlas";

export type GigerPropName = keyof typeof GIGER_PROPS_ATLAS_LAYOUT;

export type GigerPropSpec = {
  name: GigerPropName;
  fx: number;
  depth: number;
};

// All twelve relics join the shared rotating seabed pool. The nominal positions
// and depths document their full-family preview arrangement; runtime rotation
// assigns the visible slots.
export const GIGER_PROP_SPECS: GigerPropSpec[] = [
  { name: "necronom_reliquary", fx: 0.04, depth: 22 },
  { name: "birth_machine_capsule", fx: 0.125, depth: 42 },
  { name: "passage_portal_fragment", fx: 0.21, depth: 28 },
  { name: "li_portrait_shrine", fx: 0.295, depth: 48 },
  { name: "harkonnen_chair_wreck", fx: 0.38, depth: 18 },
  { name: "giger_bar_stool_relic", fx: 0.465, depth: 38 },
  { name: "biomechanical_microphone_stand", fx: 0.55, depth: 26 },
  { name: "kookoo_facial_frame", fx: 0.635, depth: 50 },
  { name: "brain_salad_gate", fx: 0.72, depth: 20 },
  { name: "atomic_child_toy", fx: 0.805, depth: 44 },
  { name: "biomechanical_timepiece", fx: 0.89, depth: 30 },
  { name: "mordor_engine_core", fx: 0.97, depth: 46 },
];
