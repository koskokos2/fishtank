import type { KAPLAYCtx } from "kaplay";
import { groundZ } from "./backdrop";
import type { PropPlacement } from "./propPlacement";
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

export type StarWarsDisplayData = {
  primary: number;
  secondary: number;
  samples: number[];
};

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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

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

export function spawnStarWarsProps(
  k: KAPLAYCtx,
  placements: Map<string, PropPlacement>,
) {
  const data: Record<StarWarsDisplayName, StarWarsDisplayData> = {
    hologram_strategy_table: { primary: 0.54, secondary: 0.31, samples: [] },
    galactic_field_terminal: { primary: 0.66, secondary: 0.42, samples: [] },
  };

  for (const spec of STAR_WARS_PROP_SPECS) {
    const layout = STAR_WARS_PROPS_ATLAS_LAYOUT[spec.name];
    const { rootX, rootY, spriteY } = placements.get(spec.name)!;
    k.add([
      k.sprite("star-wars-props", { frame: layout.frame }),
      k.pos(rootX, spriteY),
      k.anchor("bot"),
      k.z(groundZ(rootY)),
    ]);

    if (
      spec.name === "hologram_strategy_table" ||
      spec.name === "galactic_field_terminal"
    )
      spawnReadout(k, spec.name, rootX, spriteY, groundZ(rootY) + 0.01, data);
  }

  return {
    setDisplayData(
      name: StarWarsDisplayName,
      next: Partial<StarWarsDisplayData>,
    ) {
      const current = data[name];
      Object.assign(current, next);
      current.primary = clamp01(current.primary);
      current.secondary = clamp01(current.secondary);
      current.samples = current.samples.map(clamp01).slice(-12);
    },
  };
}

function spawnReadout(
  k: KAPLAYCtx,
  name: StarWarsDisplayName,
  rootX: number,
  spriteY: number,
  z: number,
  data: Record<StarWarsDisplayName, StarWarsDisplayData>,
) {
  const window = STAR_WARS_DISPLAY_WINDOWS[name];
  const originX = rootX - STAR_WARS_PROPS_ATLAS_CELL / 2;
  const originY = spriteY - STAR_WARS_PROPS_ATLAS_CELL;
  k.add([
    k.z(z),
    {
      draw() {
        const t = k.time();
        const value = data[name];
        if (window.shape === "ellipse") {
          const cx = originX + window.cx;
          const cy = originY + window.cy;
          const at = (u: number, v: number) =>
            k.vec2(
              cx + u * window.ax + v * window.bx,
              cy + u * window.ay + v * window.by,
            );
          const mask = Array.from({ length: 28 }, (_, index) => {
            const angle = (index / 28) * Math.PI * 2;
            return at(Math.cos(angle), Math.sin(angle));
          });
          k.drawMasked(
            () => {
              const sweep = t * 0.42 + value.primary * Math.PI * 2;
              k.drawLine({
                p1: at(0, 0),
                p2: at(Math.cos(sweep) * 0.9, Math.sin(sweep) * 0.9),
                width: 1,
                color: k.rgb(107, 239, 235),
                opacity: 0.78,
              });
              for (let index = 0; index < 3; index++) {
                const angle =
                  value.secondary * Math.PI * 2 + index * 2.17 + t * 0.08;
                const radius = 0.35 + index * 0.2;
                const blip = at(
                  Math.cos(angle) * radius,
                  Math.sin(angle) * radius,
                );
                k.drawRect({
                  pos: k.vec2(blip.x - 1, blip.y - 1),
                  width: 2,
                  height: 2,
                  color:
                    index === 1 ? k.rgb(245, 177, 67) : k.rgb(114, 245, 232),
                  opacity: 0.9,
                });
              }
            },
            () => k.drawPolygon({ pts: mask, color: k.WHITE }),
          );
          return;
        }

        const quad = window.points.map((point) => ({
          x: originX + point.x,
          y: originY + point.y,
        })) as [Point, Point, Point, Point];
        const samples = value.samples.length
          ? value.samples
          : Array.from({ length: 9 }, (_, index) =>
              clamp01(
                0.5 +
                  Math.sin(t * 0.61 + index * 0.9 + value.primary * 2.4) * 0.3,
              ),
            );
        k.drawMasked(
          () => {
            const visible = samples.slice(-9);
            visible.forEach((sample, index) => {
              const gap = 0.025;
              const width =
                (0.82 - gap * (visible.length - 1)) / visible.length;
              const u0 = 0.09 + index * (width + gap);
              drawProjectedRect(
                k,
                quad,
                u0,
                0.73 - sample * 0.5,
                u0 + width,
                0.73,
                [76, 218, 211],
                0.72,
              );
            });
            drawProjectedRect(
              k,
              quad,
              0.09,
              0.84,
              0.09 + value.secondary * 0.82,
              0.92,
              [240, 169, 63],
              0.9,
            );
          },
          () =>
            k.drawPolygon({
              pts: quad.map((point) => k.vec2(point.x, point.y)),
              color: k.WHITE,
            }),
        );
      },
    },
  ]);
}

function project(
  quad: [Point, Point, Point, Point],
  u: number,
  v: number,
): Point {
  const [tl, tr, br, bl] = quad;
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}

function drawProjectedRect(
  k: KAPLAYCtx,
  quad: [Point, Point, Point, Point],
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: [number, number, number],
  opacity: number,
) {
  const points = [
    project(quad, u0, v0),
    project(quad, u1, v0),
    project(quad, u1, v1),
    project(quad, u0, v1),
  ];
  k.drawPolygon({
    pts: points.map((point) => k.vec2(point.x, point.y)),
    color: k.rgb(...color),
    opacity,
  });
}
