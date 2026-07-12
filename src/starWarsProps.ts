import type { KAPLAYCtx } from "kaplay";
import { withDrawProfile } from "./profiling";
import { drawScreenText, type ScreenQuad } from "./screenText";
import {
  STAR_WARS_PROPS_ATLAS_CELL,
  STAR_WARS_PROPS_ATLAS_LAYOUT,
} from "./starWarsPropsAtlas";

export type StarWarsPropName = keyof typeof STAR_WARS_PROPS_ATLAS_LAYOUT;
export type StarWarsDisplayName =
  | "hologram_strategy_table"
  | "galactic_field_terminal";

export type StarWarsPropSpec = {
  name: StarWarsPropName;
  fx: number;
  depth: number;
};

// Use every droid, relic, machine, and wreck in the atlas while leaving out the
// two display-category props. Four burial tiers keep the larger selection from
// becoming a single prop horizon.
export const STAR_WARS_PROP_SPECS: StarWarsPropSpec[] = [
  { name: "utility_droid_dome", fx: 0.03, depth: 14 },
  { name: "moisture_collector", fx: 0.102, depth: 30 },
  { name: "cracked_guardian_helmet", fx: 0.175, depth: 46 },
  { name: "translator_droid_head", fx: 0.247, depth: 62 },
  { name: "spherical_courier_droid", fx: 0.319, depth: 14 },
  { name: "collapsed_survey_remote", fx: 0.392, depth: 30 },
  { name: "interceptor_wing_wreckage", fx: 0.464, depth: 46 },
  { name: "ceremonial_power_coupler", fx: 0.536, depth: 62 },
  { name: "resistance_field_reactor", fx: 0.608, depth: 14 },
  { name: "planetary_probe_wreck", fx: 0.681, depth: 30 },
  { name: "galactic_cargo_crate", fx: 0.753, depth: 46 },
  { name: "crystal_containment_canister", fx: 0.825, depth: 62 },
  { name: "folding_comms_dish", fx: 0.897, depth: 14 },
  { name: "cantina_beverage_dispenser", fx: 0.97, depth: 30 },
];

type Point = { x: number; y: number };
type DisplayWindow =
  | {
      shape: "ellipse";
      cx: number;
      cy: number;
      ax: number;
      ay: number;
      bx: number;
      by: number;
    }
  | {
      shape: "quad";
      points: [Point, Point, Point, Point];
    };

// Cell-local geometry traced inside the final 128px art rather than inferred
// from its bounding box. Both masks are inset from the bright bezel pixels.
export const STAR_WARS_DISPLAY_WINDOWS = {
  hologram_strategy_table: {
    shape: "ellipse",
    cx: 65,
    cy: 53,
    ax: 28,
    ay: 0,
    bx: -1,
    by: 13,
  },
  galactic_field_terminal: {
    shape: "quad",
    points: [
      { x: 43, y: 41 },
      { x: 77, y: 48 },
      { x: 73, y: 73 },
      { x: 40, y: 66 },
    ],
  },
} satisfies Record<StarWarsDisplayName, DisplayWindow>;

const FPS_SAMPLE_PERIOD = 0.25; // s between refreshes so the digits don't flicker

export function spawnFpsReadout(
  k: KAPLAYCtx,
  rootX: number,
  spriteY: number,
  z: number,
) {
  const originX = rootX - STAR_WARS_PROPS_ATLAS_CELL / 2;
  const originY = spriteY - STAR_WARS_PROPS_ATLAS_CELL;
  const quad = STAR_WARS_DISPLAY_WINDOWS.galactic_field_terminal.points.map(
    (point) => ({ x: originX + point.x, y: originY + point.y }),
  ) as ScreenQuad;

  let shown = 0;
  let lastSample = -Infinity;
  k.add([
    k.z(z),
    {
      draw() {
        withDrawProfile("props", () => {
          const t = k.time();
          if (t - lastSample >= FPS_SAMPLE_PERIOD) {
            lastSample = t;
            shown = Math.min(999, Math.round(k.debug.fps()));
          }
          // 2px glyph pixels, centred on the screen art's optical centre, which
          // sits left and below the quad's geometric centre.
          drawScreenText(
            k,
            quad,
            String(shown),
            0.45,
            0.56,
            2,
            [114, 245, 232],
            0.85,
          );
        });
      },
    },
  ]);
}
