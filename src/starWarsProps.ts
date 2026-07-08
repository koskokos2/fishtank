import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { RES } from "./res";
import {
  STAR_WARS_PROPS_ATLAS_CELL,
  STAR_WARS_PROPS_ATLAS_LAYOUT,
} from "./starWarsPropsAtlas";

export type StarWarsPropName = keyof typeof STAR_WARS_PROPS_ATLAS_LAYOUT;
export type StarWarsDisplayName = "hologram_strategy_table" | "galactic_field_terminal";

export type StarWarsDisplayData = {
  primary: number;
  secondary: number;
  samples: number[];
};

export type StarWarsPropSpec = {
  name: StarWarsPropName;
  fx: number;
  depth: number;
  z: number;
};

// A sparse cross-section of the atlas: two functional displays and three
// instantly readable pieces of galactic salvage. The different burial depths
// keep them from becoming another straight prop horizon.
export const STAR_WARS_PROP_SPECS: StarWarsPropSpec[] = [
  { name: "utility_droid_dome", fx: 0.27, depth: 35, z: -70 },
  { name: "hologram_strategy_table", fx: 0.475, depth: 24, z: -83 },
  { name: "cracked_guardian_helmet", fx: 0.60, depth: 24, z: -68 },
  { name: "galactic_field_terminal", fx: 0.735, depth: 23, z: -82 },
  { name: "crystal_containment_canister", fx: 0.975, depth: 35, z: -70 },
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
export const STAR_WARS_DISPLAY_WINDOWS: Record<StarWarsDisplayName, DisplayWindow> = {
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
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function spawnStarWarsProps(k: KAPLAYCtx) {
  const data: Record<StarWarsDisplayName, StarWarsDisplayData> = {
    hologram_strategy_table: { primary: 0.54, secondary: 0.31, samples: [] },
    galactic_field_terminal: { primary: 0.66, secondary: 0.42, samples: [] },
  };

  for (const spec of STAR_WARS_PROP_SPECS) {
    const layout = STAR_WARS_PROPS_ATLAS_LAYOUT[spec.name];
    const rootX = spec.fx * k.width();
    const left = Math.round(rootX - STAR_WARS_PROPS_ATLAS_CELL / 2);
    let floor = -Infinity;
    for (let x = left + layout.contactLeft; x <= left + layout.contactRight; x++)
      floor = Math.max(floor, sandTopAt(Math.max(0, Math.min(k.width() - 1, x))));
    const rootY = floor + spec.depth * RES;
    const spriteY = rootY + STAR_WARS_PROPS_ATLAS_CELL - layout.bottom;
    k.add([
      k.sprite("star-wars-props", { frame: layout.frame }),
      k.pos(rootX, spriteY),
      k.anchor("bot"),
      k.z(spec.z),
    ]);

    if (spec.name === "hologram_strategy_table" || spec.name === "galactic_field_terminal")
      spawnReadout(k, spec.name, rootX, spriteY, spec.z + 0.01, data);
  }

  return {
    setDisplayData(name: StarWarsDisplayName, next: Partial<StarWarsDisplayData>) {
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
            k.vec2(cx + u * window.ax + v * window.bx, cy + u * window.ay + v * window.by);
          const mask = Array.from({ length: 28 }, (_, index) => {
            const angle = index / 28 * Math.PI * 2;
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
                const angle = value.secondary * Math.PI * 2 + index * 2.17 + t * 0.08;
                const radius = 0.35 + index * 0.2;
                const blip = at(Math.cos(angle) * radius, Math.sin(angle) * radius);
                k.drawRect({
                  pos: k.vec2(blip.x - 1, blip.y - 1),
                  width: 2,
                  height: 2,
                  color: index === 1 ? k.rgb(245, 177, 67) : k.rgb(114, 245, 232),
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
              clamp01(0.5 + Math.sin(t * 0.61 + index * 0.9 + value.primary * 2.4) * 0.3),
            );
        k.drawMasked(
          () => {
            const visible = samples.slice(-9);
            visible.forEach((sample, index) => {
              const gap = 0.025;
              const width = (0.82 - gap * (visible.length - 1)) / visible.length;
              const u0 = 0.09 + index * (width + gap);
              drawProjectedRect(k, quad, u0, 0.73 - sample * 0.5, u0 + width, 0.73, [76, 218, 211], 0.72);
            });
            drawProjectedRect(k, quad, 0.09, 0.84, 0.09 + value.secondary * 0.82, 0.92, [240, 169, 63], 0.9);
          },
          () => k.drawPolygon({
            pts: quad.map((point) => k.vec2(point.x, point.y)),
            color: k.WHITE,
          }),
        );
      },
    },
  ]);
}

function project(quad: [Point, Point, Point, Point], u: number, v: number): Point {
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
