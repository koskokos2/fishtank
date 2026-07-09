import type { KAPLAYCtx } from "kaplay";
import { groundZ, sandTopAt } from "./backdrop";
import { clamp01 } from "./color";
import { spawnSandPuff } from "./sandPuff";
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
  top: number;
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

const ROTATION_SECONDS = 30;

// Drop-in descent z: between the dunes-only sand overlay (-150, tank.ts) and
// the far kelp (-180), so a falling prop reads distant — behind mid plants —
// and nestles behind dune humps as it nears touchdown, where it swaps to groundZ.
const TRANSIT_Z = -160;
const SINK_SPEED = 20 * RES; // px/s burial
const DROP_SPEED = 48 * RES; // px/s descent through the water column
const SCUFF_PERIOD = 0.9; // s between small puffs while sinking
const SWAY_AMP_0 = 5 * RES;
const SWAY_AMP_1 = 2 * RES;
const SWAY_FREQ_0 = 0.7; // rad/s
const SWAY_FREQ_1 = 1.9; // rad/s
const SWAY_ROCK_DEG = 3;
const SWAY_FADE = 60 * RES; // design px of descent over which sway/rock decays to 0
const SETTLE_DIP = 3 * RES;
const SETTLE_DUR = 0.35;

export type PropObstacle = { x0: number; x1: number; depth: number }; // buffer px; depth = px below sand surface
let obstacles: readonly PropObstacle[] = []; // fresh array identity per change = cheap version stamp
const slotObstacles: PropObstacle[] = [];
const DEPTH_BAND = 10 * RES; // creature within 10 design px of prop depth = conflict

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

export function getPropObstacles(): readonly PropObstacle[] {
  return obstacles;
}

function conflicts(o: PropObstacle, depth: number | undefined) {
  return depth === undefined || Math.abs(depth - o.depth) < DEPTH_BAND;
}

export function insidePropFootprint(
  x: number,
  halfWidth: number,
  depth?: number,
): boolean {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!conflicts(o, depth)) continue;
    if (x >= o.x0 - halfWidth && x <= o.x1 + halfWidth) return true;
  }
  return false;
}

// Points on the expanded-footprint boundary count as inside, so every stop
// point the helpers hand back sits a standoff strictly outside it — a creature
// parked exactly on the edge would count as "inside" next trip, making its
// clamp skip the very prop it is touching.
export function nearestClearX(
  x: number,
  halfWidth: number,
  standoff: number,
  depth?: number,
  minX = -Infinity,
  maxX = Infinity,
): number {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!conflicts(o, depth)) continue;
    const lo = o.x0 - halfWidth;
    const hi = o.x1 + halfWidth;
    if (x < lo || x > hi) continue;
    // Prefer the nearer exit, but never one beyond the caller's wall margin —
    // clamping it back would strand the creature inside the footprint.
    const left = lo - standoff;
    const right = hi + standoff;
    if (left >= minX && (right > maxX || x - lo <= hi - x)) return left;
    if (right <= maxX) return right;
    return x;
  }
  return x;
}

export function clampPathX(
  fromX: number,
  toX: number,
  halfWidth: number,
  standoff: number,
  fromDepth?: number,
  toDepth?: number,
): number {
  let result = toX;
  const sweepLo = Math.min(fromX, toX);
  const sweepHi = Math.max(fromX, toX);
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!conflicts(o, fromDepth) && !conflicts(o, toDepth)) continue;
    const lo = o.x0 - halfWidth;
    const hi = o.x1 + halfWidth;
    if (fromX >= lo && fromX <= hi) continue; // already inside; self-heal handles escape
    if (sweepLo > hi || sweepHi < lo) continue; // swept interval doesn't enter this footprint
    result =
      toX >= fromX
        ? Math.min(result, lo - standoff)
        : Math.max(result, hi + standoff);
  }
  return result;
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

function claimSlot(
  prop: WhitelistedProp,
  slot: PropSlot,
  slotIndex: number,
  placement: PropPlacement,
) {
  const left = Math.round(placement.rootX - prop.cell / 2);
  slotObstacles[slotIndex] = {
    x0: left + prop.layout.contactLeft,
    x1: left + prop.layout.contactRight,
    depth: slot.depth * RES,
  };
  obstacles = [...slotObstacles];
}

function spawnProp(
  k: KAPLAYCtx,
  prop: WhitelistedProp,
  slot: PropSlot,
  slotIndex: number,
  spriteY?: number,
  z?: number,
) {
  const placement = placeProp(k.width(), prop, slot);
  claimSlot(prop, slot, slotIndex, placement);
  return k.add([
    k.sprite(prop.sprite, { frame: prop.frame }),
    k.pos(placement.rootX, spriteY ?? placement.spriteY),
    k.anchor("bot"),
    k.rotate(0),
    k.z(z ?? groundZ(placement.rootY)),
  ]);
}

type PropObject = ReturnType<typeof spawnProp>;

// Outgoing prop: slides down while masked at a fixed line at its own resting
// art bottom, so it vanishes bottom-up with no pop — a resting prop already
// sits slot.depth px below the dune line drawn over the sand, so any z swap
// into the sand overlay's occlusion band would hide that whole portion at once
// (all of it, for small props on deep slots). Scuff puffs dress the burial.
function sinkOutProp(
  k: KAPLAYCtx,
  object: PropObject,
  prop: WhitelistedProp,
  onDone: () => void,
) {
  const width = k.width();
  const rootX = object.pos.x;
  const left = Math.round(rootX - prop.cell / 2);
  const sandLine = footprintFloor(width, left, prop.layout);
  const spriteY0 = object.pos.y;
  const clipY = spriteY0 - prop.cell + prop.layout.bottom; // resting art bottom
  const artHeight = prop.layout.bottom - prop.layout.top;
  const z = object.z;
  object.destroy();

  let sunk = 0;
  let scuffTimer = SCUFF_PERIOD * k.rand(0.7, 1.3);
  spawnSandPuff(k, rootX, sandLine, 0.9);

  const sinker = k.add([
    k.z(z),
    {
      draw() {
        k.drawMasked(
          () =>
            k.drawSprite({
              sprite: prop.sprite,
              frame: prop.frame,
              anchor: "bot",
              pos: k.vec2(rootX, Math.round(spriteY0 + sunk)),
            }),
          () =>
            k.drawRect({
              pos: k.vec2(left - prop.cell, clipY - prop.cell * 2),
              width: prop.cell * 3,
              height: prop.cell * 2,
              color: k.WHITE,
            }),
        );
      },
    },
  ]);

  sinker.onUpdate(() => {
    const dt = k.dt();
    sunk += SINK_SPEED * dt;

    scuffTimer -= dt;
    if (scuffTimer <= 0) {
      scuffTimer = SCUFF_PERIOD * k.rand(0.7, 1.3);
      spawnSandPuff(
        k,
        k.rand(left + prop.layout.contactLeft, left + prop.layout.contactRight),
        sandLine,
        0.2,
        0.6,
        0.8,
      );
    }

    if (sunk >= artHeight) {
      sinker.destroy();
      onDone();
    }
  });
}

// Incoming prop: drifts down from off-screen with decaying sway/rock, lands with
// a puff, keeps sinking behind the dune to its slot depth, settles, then swaps
// back in front of the sand. claimSlot runs at spawn so the landing zone is
// reserved for benthic creatures through the whole ~8s descent.
function dropInProp(
  k: KAPLAYCtx,
  prop: WhitelistedProp,
  slot: PropSlot,
  slotIndex: number,
  onFinish: (object: PropObject) => void,
) {
  const placement = placeProp(k.width(), prop, slot);
  const spriteY0 = prop.cell - prop.layout.bottom - 2 * RES; // art bottom just above y=0
  const object = spawnProp(k, prop, slot, slotIndex, spriteY0, TRANSIT_Z);

  const rootX = placement.rootX;
  const left = Math.round(rootX - prop.cell / 2);
  const sandLine = footprintFloor(k.width(), left, prop.layout);
  const targetSpriteY = placement.spriteY;
  const phase0 = k.rand(0, Math.PI * 2);
  const phase1 = k.rand(0, Math.PI * 2);
  let landed = false;
  let settling = false;
  let dipTimer = 0;
  let t = 0;
  let y = spriteY0; // unrounded accumulator — rounding pos.y directly would quantize the per-frame step and tie the speed to the frame rate

  const controller = object.onUpdate(() => {
    const dt = k.dt();
    t += dt;

    if (!settling) {
      y += DROP_SPEED * dt;
      object.pos.y = Math.round(y);
      const env = clamp01((targetSpriteY - y) / SWAY_FADE);
      const sway =
        Math.sin(t * SWAY_FREQ_0 + phase0) * SWAY_AMP_0 +
        Math.sin(t * SWAY_FREQ_1 + phase1) * SWAY_AMP_1;
      object.pos.x = Math.round(rootX + env * sway);
      object.angle = env * Math.sin(t * SWAY_FREQ_0 + phase0) * SWAY_ROCK_DEG;

      const artBottom = y - prop.cell + prop.layout.bottom;
      if (!landed && artBottom >= sandLine) {
        landed = true;
        // Resting props draw their buried depth in front of the sand, so swap
        // out of the occlusion band at touchdown — the remaining descent + dip
        // then read as pressing in, and the puff masks the swap.
        object.z = groundZ(placement.rootY);
        spawnSandPuff(k, rootX, sandLine, 1);
      }

      if (y >= targetSpriteY + SETTLE_DIP) {
        object.pos.y = targetSpriteY + SETTLE_DIP;
        settling = true;
        dipTimer = SETTLE_DUR;
      }
    } else {
      dipTimer = Math.max(0, dipTimer - dt);
      object.pos.y = Math.round(
        targetSpriteY + SETTLE_DIP * (dipTimer / SETTLE_DUR),
      );
      object.angle = 0;
      object.pos.x = rootX; // match spawnProp's unrounded placement so the settled prop sits exactly where a normal spawn would

      if (dipTimer <= 0) {
        object.pos.y = targetSpriteY;
        controller.cancel();
        onFinish(object);
      }
    }
  });
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
    object: spawnProp(k, prop, PROP_SLOTS[slotIndex], slotIndex),
  }));

  // Wait five minutes before the first change. Each tick evicts one random
  // occupant and draws from a shuffled no-repeat cycle, so every whitelisted
  // prop is shown at least once before the cycle refills from the full pool.
  let rotating = false;
  k.loop(
    ROTATION_SECONDS,
    () => {
      if (rotating) return; // a handoff (~12-15s) never overlaps the next 300s tick, but guard anyway
      rotating = true;
      const slotIndex = k.randi(0, displayed.length);
      const activeIds = new Set(displayed.map(({ prop }) => prop.id));
      const next = takeNextProp(activeIds);
      const old = displayed[slotIndex];
      displayed[slotIndex] = { ...old, prop: next }; // next's id leaves the pool immediately
      sinkOutProp(k, old.object, old.prop, () =>
        dropInProp(k, next, PROP_SLOTS[slotIndex], slotIndex, (object) => {
          displayed[slotIndex].object = object;
          rotating = false;
        }),
      );
    },
    undefined,
    true,
  );
}
