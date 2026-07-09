import type { KAPLAYCtx } from "kaplay";
import { groundZ, sandTopAt } from "./backdrop";
import { RES } from "./res";
import { SCI_FI_PROP_SPECS } from "./sciFiProps";
import {
  SCI_FI_PROPS_ATLAS_CELL,
  SCI_FI_PROPS_ATLAS_LAYOUT,
} from "./sciFiPropsAtlas";
import { ELDRITCH_PROP_SPECS } from "./eldritchProps";
import {
  ELDRITCH_PROPS_ATLAS_CELL,
  ELDRITCH_PROPS_ATLAS_LAYOUT,
} from "./eldritchPropsAtlas";
import { STAR_WARS_PROP_SPECS } from "./starWarsProps";
import {
  STAR_WARS_PROPS_ATLAS_CELL,
  STAR_WARS_PROPS_ATLAS_LAYOUT,
} from "./starWarsPropsAtlas";
import { POP_CULTURE_PROP_SPECS } from "./popCultureProps";
import {
  POP_CULTURE_PROPS_ATLAS_CELL,
  POP_CULTURE_PROPS_ATLAS_LAYOUT,
} from "./popCulturePropsAtlas";
import {
  SMALL_PROPS_ATLAS_CELL,
  SMALL_PROPS_ATLAS_LAYOUT,
} from "./smallPropsAtlas";

type Layout = {
  bottom: number;
  contactLeft: number;
  contactRight: number;
};

export type PropPlacement = {
  rootX: number;
  rootY: number;
  spriteY: number;
};

export type WhitelistedProp = {
  id: string;
  name: string;
  sprite: "sci-fi-props" | "eldritch-props" | "star-wars-props" | "pop-culture-props" | "small-props";
  frame: number;
  cell: number;
  layout: Layout;
};

type PropSlot = { fx: number; depth: number };

const ROTATION_SECONDS = 5 * 60;

// Six evenly spaced centres leave roomy prop silhouettes across the 1920px
// virtual width. Alternating depth breaks up the row while keeping every base
// comfortably inside the 58px-deep design-space bed.
export const PROP_SLOTS: readonly PropSlot[] = [
  { fx: 0.08, depth: 14 },
  { fx: 0.24, depth: 42 },
  { fx: 0.4, depth: 24 },
  { fx: 0.56, depth: 50 },
  { fx: 0.72, depth: 18 },
  { fx: 0.88, depth: 36 },
];

const VISIBLE_PROP_COUNT = PROP_SLOTS.length;

// Rows 1-3 of the small-props atlas; row 0 is intentionally not whitelisted.
export const SMALL_PROP_NAMES = [
  "forked_driftwood",
  "plank_with_brass_ring",
  "fish_skeleton",
  "buried_jawbone",
  "leaning_broken_amphora",
  "patterned_pottery_shards",
  "sideways_cracked_jar",
  "spiral_stone_tablet",
  "tarnished_coin_spill",
  "cracked_brass_compass",
  "sideways_message_bottle",
  "broken_anchor_and_chain",
] as const;

function atlasProps(
  family: string,
  sprite: WhitelistedProp["sprite"],
  names: readonly string[],
  cell: number,
  layouts: Record<string, Layout & { frame?: number; row?: number; col?: number }>,
): WhitelistedProp[] {
  return names.map((name) => {
    const layout = layouts[name];
    return {
      id: `${family}:${name}`,
      name,
      sprite,
      frame: layout.frame ?? layout.row! * 4 + layout.col!,
      cell,
      layout,
    };
  });
}

// This is the complete prop pool built from the selections in each family.
// The family spec arrays remain the single source of truth for those whitelists.
export const PROP_WHITELIST: readonly WhitelistedProp[] = [
  ...atlasProps(
    "sci-fi",
    "sci-fi-props",
    SCI_FI_PROP_SPECS.map((spec) => spec.name),
    SCI_FI_PROPS_ATLAS_CELL,
    SCI_FI_PROPS_ATLAS_LAYOUT,
  ),
  ...atlasProps(
    "eldritch",
    "eldritch-props",
    ELDRITCH_PROP_SPECS.map((spec) => spec.name),
    ELDRITCH_PROPS_ATLAS_CELL,
    ELDRITCH_PROPS_ATLAS_LAYOUT,
  ),
  ...atlasProps(
    "star-wars",
    "star-wars-props",
    STAR_WARS_PROP_SPECS.map((spec) => spec.name),
    STAR_WARS_PROPS_ATLAS_CELL,
    STAR_WARS_PROPS_ATLAS_LAYOUT,
  ),
  ...atlasProps(
    "pop-culture",
    "pop-culture-props",
    POP_CULTURE_PROP_SPECS.map((spec) => spec.name),
    POP_CULTURE_PROPS_ATLAS_CELL,
    POP_CULTURE_PROPS_ATLAS_LAYOUT,
  ),
  ...atlasProps(
    "small",
    "small-props",
    SMALL_PROP_NAMES,
    SMALL_PROPS_ATLAS_CELL,
    SMALL_PROPS_ATLAS_LAYOUT,
  ),
];

// Use the lowest screen-space terrain point under the whole contact footprint,
// so neither edge of a prop can float above a curved dune.
function footprintFloor(width: number, left: number, layout: Layout) {
  let floor = -Infinity;
  for (let x = left + layout.contactLeft; x <= left + layout.contactRight; x++)
    floor = Math.max(floor, sandTopAt(Math.max(0, Math.min(width - 1, x))));
  return floor;
}

export function placeProp(
  width: number,
  prop: WhitelistedProp,
  slot: PropSlot,
): PropPlacement {
  const rootX = slot.fx * width;
  const left = Math.round(rootX - prop.cell / 2);
  const rootY = footprintFloor(width, left, prop.layout) + slot.depth * RES;
  return {
    rootX,
    rootY,
    spriteY: rootY + prop.cell - prop.layout.bottom,
  };
}

function shuffled<T>(k: KAPLAYCtx, values: readonly T[]) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = k.randi(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function refillPropCycle(k: KAPLAYCtx, visibleIds: ReadonlySet<string>) {
  // Refill from the complete whitelist, but count the props already on screen
  // as shown for the new cycle so they don't immediately repeat into another
  // slot. Once those visible props are evicted, they stay out until the next
  // cycle reset.
  return shuffled(k, PROP_WHITELIST).filter((prop) => !visibleIds.has(prop.id));
}

function spawnProp(k: KAPLAYCtx, prop: WhitelistedProp, slot: PropSlot) {
  const placement = placeProp(k.width(), prop, slot);
  return k.add([
    k.sprite(prop.sprite, { frame: prop.frame }),
    k.pos(placement.rootX, placement.spriteY),
    k.anchor("bot"),
    k.z(groundZ(placement.rootY)),
  ]);
}

export function spawnRotatingProps(k: KAPLAYCtx) {
  if (PROP_WHITELIST.length < VISIBLE_PROP_COUNT + 1)
    throw new Error(
      `The prop rotation needs at least ${VISIBLE_PROP_COUNT + 1} whitelisted props`,
    );

  let propCycle = refillPropCycle(k, new Set());
  const takeNextProp = (visibleIds: ReadonlySet<string>) => {
    for (;;) {
      for (let i = propCycle.length - 1; i >= 0; i--) {
        const prop = propCycle[i];
        if (visibleIds.has(prop.id)) continue;
        propCycle.splice(i, 1);
        return prop;
      }

      propCycle = refillPropCycle(k, visibleIds);
    }
  };

  const initial: WhitelistedProp[] = [];
  const initialIds = new Set<string>();
  while (initial.length < VISIBLE_PROP_COUNT) {
    const prop = takeNextProp(initialIds);
    initial.push(prop);
    initialIds.add(prop.id);
  }

  const displayed = initial.map((prop, slotIndex) => ({
    prop,
    object: spawnProp(k, prop, PROP_SLOTS[slotIndex]),
  }));

  // Wait five minutes before the first change. Each tick evicts one random
  // occupant and draws from a shuffled no-repeat cycle, so every whitelisted
  // prop is shown at least once before the cycle refills from the full pool.
  k.loop(
    ROTATION_SECONDS,
    () => {
      const slotIndex = k.randi(0, displayed.length);
      const activeIds = new Set(displayed.map(({ prop }) => prop.id));
      const next = takeNextProp(activeIds);
      displayed[slotIndex].object.destroy();
      displayed[slotIndex] = {
        prop: next,
        object: spawnProp(k, next, PROP_SLOTS[slotIndex]),
      };
    },
    undefined,
    true,
  );
}
