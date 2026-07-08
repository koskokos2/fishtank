import type { KAPLAYCtx } from "kaplay";
import { sandTopAt } from "./backdrop";
import { RES } from "./res";
import {
  SCI_FI_PROPS_ATLAS_CELL,
  SCI_FI_PROPS_ATLAS_LAYOUT,
} from "./sciFiPropsAtlas";

export type SciFiPropName = keyof typeof SCI_FI_PROPS_ATLAS_LAYOUT;
export type SciFiDisplayName = "retro_telemetry_terminal" | "porthole_instrument";

export type SciFiDisplayData = {
  primary: number;
  secondary: number;
  samples: number[];
};

export type SciFiPropSpec = {
  name: SciFiPropName;
  fx: number;
  depth: number;
  z: number;
};

// The full atlas remains available for later scene variants. This deliberately
// sparse subset gives the current natural seabed a curious technological story
// without turning every gap into another prop shelf.
export const SCI_FI_PROP_SPECS: SciFiPropSpec[] = [
  { name: "gravity_coil", fx: 0.045, depth: 38, z: -77 },
  { name: "retro_telemetry_terminal", fx: 0.16, depth: 42, z: -74 },
  { name: "flux_coil_power_unit", fx: 0.33, depth: 25, z: -81 },
  { name: "empty_specimen_capsule", fx: 0.545, depth: 36, z: -71 },
  { name: "three_prong_beacon", fx: 0.64, depth: 18, z: -84 },
  { name: "porthole_instrument", fx: 0.79, depth: 40, z: -75 },
  { name: "folded_alien_relic", fx: 0.925, depth: 32, z: -79 },
];

type Point = { x: number; y: number };
type DisplayWindow =
  | {
      shape: "quad";
      // Clockwise, cell-local safe corners: top-left, top-right,
      // bottom-right, bottom-left. These are inset from the visible bezel.
      points: [Point, Point, Point, Point];
    }
  | {
      shape: "round";
      cx: number;
      cy: number;
      radius: number;
    };

// Cell-local pixel rectangles deliberately sit a few pixels inside the dark
// glass borders. Keeping them separate from the generated art makes replacement
// readout code independent of future atlas regeneration.
export const SCI_FI_DISPLAY_WINDOWS: Record<SciFiDisplayName, DisplayWindow> = {
  retro_telemetry_terminal: {
    shape: "quad",
    points: [
      { x: 40, y: 38 },
      { x: 78, y: 39 },
      { x: 76, y: 58 },
      { x: 39, y: 57 },
    ],
  },
  porthole_instrument: { shape: "round", cx: 62.5, cy: 52.5, radius: 18 },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function spawnSciFiProps(k: KAPLAYCtx) {
  const data: Record<SciFiDisplayName, SciFiDisplayData> = {
    retro_telemetry_terminal: { primary: 0.67, secondary: 0.34, samples: [] },
    porthole_instrument: { primary: 0.42, secondary: 0.78, samples: [] },
  };

  for (const spec of SCI_FI_PROP_SPECS) {
    const layout = SCI_FI_PROPS_ATLAS_LAYOUT[spec.name];
    const rootX = spec.fx * k.width();
    const left = Math.round(rootX - SCI_FI_PROPS_ATLAS_CELL / 2);
    let floor = -Infinity;
    for (let x = left + layout.contactLeft; x <= left + layout.contactRight; x++)
      floor = Math.max(floor, sandTopAt(Math.max(0, Math.min(k.width() - 1, x))));
    const rootY = floor + spec.depth * RES;
    const spriteY = rootY + SCI_FI_PROPS_ATLAS_CELL - layout.bottom;
    k.add([
      k.sprite("sci-fi-props", { frame: layout.frame }),
      k.pos(rootX, spriteY),
      k.anchor("bot"),
      k.z(spec.z),
    ]);

    if (spec.name === "retro_telemetry_terminal" || spec.name === "porthole_instrument")
      spawnReadout(k, spec.name, rootX, spriteY, spec.z + 0.01, data);
  }

  return {
    setDisplayData(name: SciFiDisplayName, next: Partial<SciFiDisplayData>) {
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
  name: SciFiDisplayName,
  rootX: number,
  spriteY: number,
  z: number,
  data: Record<SciFiDisplayName, SciFiDisplayData>,
) {
  const window = SCI_FI_DISPLAY_WINDOWS[name];
  const originX = rootX - SCI_FI_PROPS_ATLAS_CELL / 2;
  const originY = spriteY - SCI_FI_PROPS_ATLAS_CELL;
  k.add([
    k.z(z),
    {
      draw() {
        const t = k.time();
        const value = data[name];
        const samples = value.samples.length
          ? value.samples
          : Array.from({ length: 10 }, (_, i) =>
              clamp01(0.48 + Math.sin(t * 0.72 + i * 0.83 + value.primary * 3) * 0.27),
            );

        if (window.shape === "round") {
          const cx = originX + window.cx;
          const cy = originY + window.cy;
          const radius = window.radius;
          const angle = t * 0.36 + value.primary * Math.PI * 2;
          k.drawMasked(
            () => {
              k.drawLine({
                p1: k.vec2(cx - radius, cy),
                p2: k.vec2(cx + radius, cy),
                width: 1,
                color: k.rgb(54, 157, 151),
                opacity: 0.35,
              });
              k.drawLine({
                p1: k.vec2(cx, cy - radius),
                p2: k.vec2(cx, cy + radius),
                width: 1,
                color: k.rgb(54, 157, 151),
                opacity: 0.35,
              });
              k.drawLine({
                p1: k.vec2(cx, cy),
                p2: k.vec2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius),
                width: 1,
                color: k.rgb(91, 226, 210),
                opacity: 0.7,
              });
              const blipAngle = value.secondary * Math.PI * 2;
              k.drawRect({
                pos: k.vec2(cx + Math.cos(blipAngle) * radius * 0.72 - 1, cy + Math.sin(blipAngle) * radius * 0.72 - 1),
                width: 2,
                height: 2,
                color: k.rgb(242, 179, 78),
                opacity: 0.92,
              });
            },
            () => k.drawCircle({
              pos: k.vec2(cx, cy),
              radius,
              color: k.WHITE,
            }),
          );
          return;
        }

        const quad = window.points.map((point) => ({
          x: originX + point.x,
          y: originY + point.y,
        })) as [Point, Point, Point, Point];
        const visibleSamples = samples.slice(-12);
        k.drawMasked(
          () => {
            const gap = 0.018;
            const usableWidth = 0.86;
            const barWidth = (usableWidth - gap * (visibleSamples.length - 1)) / visibleSamples.length;
            visibleSamples.forEach((sample, i) => {
              const u0 = 0.07 + i * (barWidth + gap);
              const u1 = u0 + barWidth;
              const v1 = 0.7;
              const v0 = v1 - sample * 0.54;
              drawQuad(k, quad, u0, v0, u1, v1, [71, 208, 199], 0.62);
            });
            drawQuad(
              k,
              quad,
              0.07,
              0.84,
              0.07 + 0.86 * value.secondary,
              0.93,
              [238, 167, 70],
              0.88,
            );
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

function projectQuad(quad: [Point, Point, Point, Point], u: number, v: number): Point {
  const [tl, tr, br, bl] = quad;
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}

function drawQuad(
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
    projectQuad(quad, u0, v0),
    projectQuad(quad, u1, v0),
    projectQuad(quad, u1, v1),
    projectQuad(quad, u0, v1),
  ];
  k.drawPolygon({
    pts: points.map((point) => k.vec2(point.x, point.y)),
    color: k.rgb(...color),
    opacity,
  });
}
