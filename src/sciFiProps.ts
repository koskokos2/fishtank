import type { KAPLAYCtx } from "kaplay";
import { groundZ } from "./backdrop";
import type { PropPlacement } from "./propPlacement";
import { drawScreenText, type ScreenQuad } from "./screenText";
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
};

// Use selected salvage outside the display-heavy first atlas row. Varying burial
// depths distribute the larger selection across substrate tiers.
export const SCI_FI_PROP_SPECS: SciFiPropSpec[] = [
  { name: "flux_coil_power_unit", fx: 0.04, depth: 23 },
  { name: "empty_specimen_capsule", fx: 0.125, depth: 42 },
  { name: "spherical_sensor", fx: 0.21, depth: 31 },
  { name: "energy_cell_carrier", fx: 0.38, depth: 25 },
  { name: "folded_alien_relic", fx: 0.465, depth: 47 },
  { name: "temporal_regulator", fx: 0.55, depth: 36 },
  { name: "data_canisters", fx: 0.635, depth: 58 },
  { name: "biomechanical_seed_pod", fx: 0.72, depth: 28 },
  { name: "three_prong_beacon", fx: 0.805, depth: 45 },
  { name: "cracked_machine_shell", fx: 0.89, depth: 20 },
  { name: "gravity_coil", fx: 0.97, depth: 50 },
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
      // Half-axis vectors of the dial face as projected on screen: dial-space
      // u maps to (ax, ay), v to (bx, by). Encodes the glass ellipse's
      // foreshortening and tilt, so readouts drawn in unit-dial coordinates
      // land on the angled face.
      ax: number;
      ay: number;
      bx: number;
      by: number;
    };

// Cell-local screen-face geometry, traced from the art's 3/4-perspective glass
// and inset a few pixels from the bezel. Keeping it separate from the generated
// art makes replacement readout code independent of future atlas regeneration.
export const SCI_FI_DISPLAY_WINDOWS: Record<SciFiDisplayName, DisplayWindow> = {
  retro_telemetry_terminal: {
    shape: "quad",
    points: [
      { x: 42, y: 42 },
      { x: 72, y: 45 },
      { x: 70, y: 68 },
      { x: 40, y: 65 },
    ],
  },
  porthole_instrument: {
    shape: "round",
    cx: 57.5,
    cy: 52,
    ax: 15.5,
    ay: 1.5,
    bx: -1.5,
    by: 18,
  },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Traced corners of the amber wedge console's dark glass, inset from the bezel.
const AMBER_CONSOLE_SCREEN: ScreenQuad = [
  { x: 45, y: 47 },
  { x: 80, y: 48 },
  { x: 70, y: 67 },
  { x: 36, y: 63 },
];

// Open-Meteo: free, keyless, CORS-enabled current air temperature (°C).
const TEMPERATURE_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=51.44162&longitude=0.14866&current=temperature_2m";
const TEMPERATURE_REFRESH_SECONDS = 10 * 60;

export function spawnTemperatureReadout(
  k: KAPLAYCtx,
  rootX: number,
  spriteY: number,
  z: number,
) {
  const originX = rootX - SCI_FI_PROPS_ATLAS_CELL / 2;
  const originY = spriteY - SCI_FI_PROPS_ATLAS_CELL;
  const quad = AMBER_CONSOLE_SCREEN.map((point) => ({
    x: originX + point.x,
    y: originY + point.y,
  })) as ScreenQuad;

  // "--" until the first fetch lands; a failed refresh keeps the last reading
  // on screen until the next try.
  let reading = "--";
  const refresh = async () => {
    try {
      const response = await fetch(TEMPERATURE_URL);
      if (!response.ok) return;
      const celsius = (await response.json())?.current?.temperature_2m;
      if (typeof celsius === "number") reading = String(Math.round(celsius));
    } catch {}
  };
  refresh();
  k.loop(TEMPERATURE_REFRESH_SECONDS, refresh);

  k.add([
    k.z(z),
    {
      draw() {
        // 2px glyph pixels on the ~35x18px glass; "-12" (11 columns) still
        // fits inside the bezel.
        drawScreenText(k, quad, reading, 0.5, 0.5, 2, [240, 169, 63], 0.9);
      },
    },
  ]);
}

export function spawnSciFiProps(
  k: KAPLAYCtx,
  placements: Map<string, PropPlacement>,
) {
  const data: Record<SciFiDisplayName, SciFiDisplayData> = {
    retro_telemetry_terminal: { primary: 0.67, secondary: 0.34, samples: [] },
    porthole_instrument: { primary: 0.42, secondary: 0.78, samples: [] },
  };

  for (const spec of SCI_FI_PROP_SPECS) {
    const layout = SCI_FI_PROPS_ATLAS_LAYOUT[spec.name];
    const { rootX, rootY, spriteY } = placements.get(spec.name)!;
    k.add([
      k.sprite("sci-fi-props", { frame: layout.frame }),
      k.pos(rootX, spriteY),
      k.anchor("bot"),
      k.z(groundZ(rootY)),
    ]);

    if (spec.name === "retro_telemetry_terminal" || spec.name === "porthole_instrument")
      spawnReadout(k, spec.name, rootX, spriteY, groundZ(rootY) + 0.01, data);
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
          const at = (u: number, v: number) =>
            k.vec2(cx + u * window.ax + v * window.bx, cy + u * window.ay + v * window.by);
          const angle = t * 0.36 + value.primary * Math.PI * 2;
          const rim = Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            return at(Math.cos(a), Math.sin(a));
          });
          k.drawMasked(
            () => {
              k.drawLine({
                p1: at(-1, 0),
                p2: at(1, 0),
                width: 1,
                color: k.rgb(54, 157, 151),
                opacity: 0.35,
              });
              k.drawLine({
                p1: at(0, -1),
                p2: at(0, 1),
                width: 1,
                color: k.rgb(54, 157, 151),
                opacity: 0.35,
              });
              k.drawLine({
                p1: at(0, 0),
                p2: at(Math.cos(angle), Math.sin(angle)),
                width: 1,
                color: k.rgb(91, 226, 210),
                opacity: 0.7,
              });
              const blipAngle = value.secondary * Math.PI * 2;
              const blip = at(Math.cos(blipAngle) * 0.72, Math.sin(blipAngle) * 0.72);
              k.drawRect({
                pos: k.vec2(blip.x - 1, blip.y - 1),
                width: 2,
                height: 2,
                color: k.rgb(242, 179, 78),
                opacity: 0.92,
              });
            },
            () => k.drawPolygon({
              pts: rim,
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
