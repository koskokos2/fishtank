import type { KAPLAYCtx } from "kaplay";
import { withDrawProfile } from "./profiling";
import { drawScreenText, type ScreenQuad } from "./screenText";
import {
  SCI_FI_PROPS_ATLAS_CELL,
  SCI_FI_PROPS_ATLAS_LAYOUT,
} from "./sciFiPropsAtlas";

export type SciFiPropName = keyof typeof SCI_FI_PROPS_ATLAS_LAYOUT;
export type SciFiDisplayName =
  | "retro_telemetry_terminal"
  | "porthole_instrument";

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
// and inset a few pixels from the bezel. Consumed by the headless previewer
// (tools/preview.ts) to render the console screens for offline art review.
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
        withDrawProfile("props", () => {
          // 2px glyph pixels on the ~35x18px glass; "-12" (11 columns) still
          // fits inside the bezel.
          drawScreenText(k, quad, reading, 0.5, 0.5, 2, [240, 169, 63], 0.9);
        });
      },
    },
  ]);
}
