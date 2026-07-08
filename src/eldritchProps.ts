import type { KAPLAYCtx } from "kaplay";
import { groundZ } from "./backdrop";
import type { PropPlacement } from "./propPlacement";
import { ELDRITCH_PROPS_ATLAS_LAYOUT } from "./eldritchPropsAtlas";

export type EldritchPropName = keyof typeof ELDRITCH_PROPS_ATLAS_LAYOUT;

export type EldritchPropSpec = {
  name: EldritchPropName;
  fx: number;
  depth: number;
};

// A curated spread of monumental and low-profile relics from the atlas.
// Alternating burial depths keeps the larger selection from reading as one
// continuous prop horizon.
export const ELDRITCH_PROP_SPECS: EldritchPropSpec[] = [
  { name: "seated_oracle_idol", fx: 0.07, depth: 61 },
  { name: "spiral_block_pillar", fx: 0.17, depth: 24 },
  { name: "whispering_stone_arch", fx: 0.28, depth: 45 },
  { name: "black_orb_votive_slab", fx: 0.39, depth: 31 },
  { name: "cracked_void_monolith", fx: 0.49, depth: 54 },
  { name: "biomechanical_tentacle_shrine", fx: 0.6, depth: 28 },
  { name: "bone_spiral_totem", fx: 0.7, depth: 48 },
  { name: "sunken_alien_astrolabe", fx: 0.79, depth: 36 },
  { name: "collapsed_tentacle_seal", fx: 0.88, depth: 39 },
  { name: "dormant_mantle_effigy", fx: 0.96, depth: 58 },
];

export function spawnEldritchProps(
  k: KAPLAYCtx,
  placements: Map<string, PropPlacement>,
) {
  for (const spec of ELDRITCH_PROP_SPECS) {
    const layout = ELDRITCH_PROPS_ATLAS_LAYOUT[spec.name];
    const { rootX, rootY, spriteY } = placements.get(spec.name)!;
    k.add([
      k.sprite("eldritch-props", { frame: layout.frame }),
      k.pos(rootX, spriteY),
      k.anchor("bot"),
      k.z(groundZ(rootY)),
    ]);
  }
}
