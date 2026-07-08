import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { RES } from "./res";
import {
  ELDRITCH_PROPS_ATLAS_CELL,
  ELDRITCH_PROPS_ATLAS_LAYOUT,
} from "./eldritchPropsAtlas";

export type EldritchPropName = keyof typeof ELDRITCH_PROPS_ATLAS_LAYOUT;

export type EldritchPropSpec = {
  name: EldritchPropName;
  fx: number;
  depth: number;
  z: number;
};

// Keep the encounter sparse. The complete atlas is available to future scene
// variants, while four widely separated relics make this tank feel discovered
// rather than decorated. Varying burial depth also breaks up the prop horizon.
export const ELDRITCH_PROP_SPECS: EldritchPropSpec[] = [
  { name: "seated_oracle_idol", fx: 0.205, depth: 61, z: -69 },
  { name: "chained_abyssal_tome", fx: 0.425, depth: 35, z: -78 },
  { name: "biomechanical_tentacle_shrine", fx: 0.69, depth: 28, z: -77 },
  { name: "collapsed_tentacle_seal", fx: 0.855, depth: 39, z: -76 },
];

export function spawnEldritchProps(k: KAPLAYCtx) {
  for (const spec of ELDRITCH_PROP_SPECS) {
    const layout = ELDRITCH_PROPS_ATLAS_LAYOUT[spec.name];
    const rootX = spec.fx * k.width();
    const left = Math.round(rootX - ELDRITCH_PROPS_ATLAS_CELL / 2);
    let floor = -Infinity;
    for (let x = left + layout.contactLeft; x <= left + layout.contactRight; x++)
      floor = Math.max(floor, sandTopAt(Math.max(0, Math.min(k.width() - 1, x))));
    const rootY = floor + spec.depth * RES;
    const spriteY = rootY + ELDRITCH_PROPS_ATLAS_CELL - layout.bottom;
    k.add([
      k.sprite("eldritch-props", { frame: layout.frame }),
      k.pos(rootX, spriteY),
      k.anchor("bot"),
      k.z(spec.z),
    ]);
  }
}
