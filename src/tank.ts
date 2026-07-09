import type { KAPLAYCtx } from "kaplay";
import { RES } from "./res";
import { groundZ, sandTopAt } from "./backdrop";
import {
  PLANT_ATLAS_CELL,
  PLANT_ATLAS_LAYOUT,
} from "./plantAtlas";
import { spawnFixedProps, spawnRotatingProps } from "./propPlacement";

const S = RES;

// The static scene is baked once into two sprites (see backdrop.ts): the
// water back plate and a transparent sand overlay (the dunes).
// setupTank places those at the back and adds the *animated* layers over them:
// caustics, swaying plants, motes, and source-based bubbles. Depth is faked
// with z-ordering.
export function setupTank(k: KAPLAYCtx) {
  const floorY = () => k.height() * 0.85;

  // The baked layers hold everything static; only the layers below animate.
  // The gap between the two z values is where far plants (the luminous kelp)
  // live, so the dune crest occludes their roots.
  k.add([k.sprite("backdrop"), k.pos(0, 0), k.z(-200)]);
  k.add([k.sprite("backdrop-sand"), k.pos(0, 0), k.z(-150)]);

  // Six live prop slots draw from the combined whitelist. One random occupant
  // is replaced by a different whitelisted prop every five minutes.
  spawnRotatingProps(k);

  // The two display consoles stay put in the gaps between the rotating slots.
  spawnFixedProps(k);

  // Atlas plants keep the good depth language of the old procedural grass, but
  // each real frond now has its own root pivot and current phase. Their roots use
  // the actual dune contour and sit several pixels inside the dense sand, where
  // the atlas' dithered alpha edge reveals the procedural substrate beneath.
  const midPlants = MID_PLANTS.map((spec) => spawnPlantCluster(k, spec));
  FOREGROUND_PLANTS.forEach((spec) => spawnPlantCluster(k, spec));

  // Lone shoots scattered between the clusters so the seabed reads as evenly
  // planted rather than tufted only at the set piece clumps.
  spawnSinglePlants(k, 15);

  // Caustics: three overlapping sine fields on a coarse grid read as the
  // shimmering light mesh, brightest near the surface and fading with depth.
  k.add([
    k.pos(0, 0),
    k.z(-95),
    {
      draw() {
        const w = k.width();
        const h = k.height();
        const cell = 12 * S;
        const t = k.time();
        for (let x = 0; x < w; x += cell) {
          for (let y = 0; y < h * 0.6; y += cell) {
            const v =
              Math.sin((x * 0.05) / S + t) +
              Math.sin((y * 0.07) / S - t * 0.8) +
              Math.sin(((x + y) * 0.04) / S + t * 1.3);
            const depth = 1 - y / (h * 0.6);
            const a = Math.max(0, v) * 0.05 * depth;
            if (a > 0.01)
              k.drawRect({
                pos: k.vec2(x, y),
                width: cell,
                height: cell,
                color: k.rgb(150, 220, 230),
                opacity: a,
              });
          }
        }
      },
    },
  ]);

  spawnMotes(k, 30);
  spawnPlantPearling(k, midPlants);
  spawnSubstrateSeeps(k, floorY);
  spawnRuinLeaks(k);
}

type PlantName = keyof typeof PLANT_ATLAS_LAYOUT;
type PlantTheme = "ribbon" | "broad" | "fern" | "mixed";
export type PlantSpec = {
  fx: number;
  depth: number;
  scale: number;
  theme: PlantTheme;
  phase: number;
  tint: [number, number, number];
  opacity: number;
  // Fixed z for the foreground clumps only; mid plants derive theirs from the
  // dune contact line via groundZ, like every other grounded object.
  z?: number;
  foreground?: boolean;
};

type AnimatedFrond = {
  rootX: number;
  rootY: number;
  height: number;
  phase: number;
  speed: number;
  baseAngle: number;
  sway: number;
  currentAngle: number;
  object: any;
};

type PlantCluster = {
  fronds: AnimatedFrond[];
};

export const MID_PLANTS: PlantSpec[] = [
  { fx: 0.025, depth: 7, scale: 0.82, theme: "ribbon", phase: 0.4, tint: [118, 164, 151], opacity: 0.78 },
  { fx: 0.12, depth: 13, scale: 1.04, theme: "mixed", phase: 1.5, tint: [190, 216, 193], opacity: 0.94 },
  { fx: 0.235, depth: 10, scale: 0.9, theme: "fern", phase: 3.1, tint: [147, 190, 163], opacity: 0.88 },
  { fx: 0.46, depth: 12, scale: 0.96, theme: "broad", phase: 4.4, tint: [182, 212, 188], opacity: 0.92 },
  { fx: 0.64, depth: 8, scale: 0.84, theme: "ribbon", phase: 2.35, tint: [126, 174, 158], opacity: 0.82 },
  { fx: 0.81, depth: 14, scale: 1.08, theme: "fern", phase: 5.5, tint: [181, 207, 181], opacity: 0.92 },
  { fx: 0.965, depth: 10, scale: 0.92, theme: "mixed", phase: 0.9, tint: [145, 186, 166], opacity: 0.86 },
];

// Like the old near-camera grass, these oversized edge clumps sit in front of
// the animals and are heavily cool-darkened. Keeping them at the side preserves
// a clear central swimming window while giving the tank genuine depth.
export const FOREGROUND_PLANTS: PlantSpec[] = [
  { fx: -0.018, depth: 9, scale: 1.78, theme: "broad", phase: 0.2, tint: [35, 59, 55], opacity: 0.96, z: 32, foreground: true },
  { fx: 0.055, depth: 8, scale: 1.42, theme: "ribbon", phase: 2.1, tint: [42, 69, 62], opacity: 0.94, z: 31, foreground: true },
  { fx: 0.95, depth: 8, scale: 1.5, theme: "fern", phase: 4.2, tint: [39, 66, 60], opacity: 0.95, z: 31, foreground: true },
  { fx: 1.018, depth: 10, scale: 1.9, theme: "mixed", phase: 5.8, tint: [31, 54, 51], opacity: 0.97, z: 33, foreground: true },
];

export const THEME_FRONDS: Record<PlantTheme, PlantName[]> = {
  ribbon: ["eelgrass_left_arc", "eelgrass_s_curve", "eelgrass_upright_wave", "eelgrass_right_arc", "bluegreen_lance_leaf"],
  broad: ["emerald_strap_leaf", "bluegreen_lance_leaf", "jagged_olive_kelp", "eelgrass_s_curve", "burgundy_accent_leaf"],
  fern: ["ferny_seaweed_stem", "bushy_hornwort_sprig", "forked_olive_branch", "eelgrass_upright_wave", "redgold_feathery_stem"],
  mixed: ["eelgrass_left_arc", "emerald_strap_leaf", "ferny_seaweed_stem", "eelgrass_right_arc", "forked_olive_branch", "jagged_olive_kelp"],
};

export const THEME_BASE: Record<PlantTheme, PlantName> = {
  ribbon: "narrow_blade_fan",
  broad: "broadleaf_rosette",
  fern: "irregular_moss_tuft",
  mixed: "fiddlehead_shoot",
};

function spawnPlantCluster(k: KAPLAYCtx, spec: PlantSpec): PlantCluster {
  const rootX = spec.fx * k.width();
  const rootY = spec.foreground
    ? k.height() + spec.depth * S
    : sandTopAt(Math.max(0, Math.min(k.width() - 1, rootX))) + spec.depth * S;
  const names = [...THEME_FRONDS[spec.theme], THEME_BASE[spec.theme]];
  const centre = (names.length - 2) / 2;
  const clusterZ = spec.foreground ? spec.z! : groundZ(rootY);
  const fronds: AnimatedFrond[] = [];

  names.forEach((name, index) => {
    const base = index === names.length - 1;
    const side = base ? 0 : index - centre;
    const spread = side * 2.1 * S * spec.scale;
    const centreBoost = base ? 0.72 : 0.78 + (1 - Math.abs(side) / (centre + 1)) * 0.28;
    const scale = spec.scale * centreBoost;
    const layout = PLANT_ATLAS_LAYOUT[name];
    const rootPad = (PLANT_ATLAS_CELL - layout.bottom) * scale;
    const baseAngle = base ? 0 : side * 4.8 + Math.sin(index * 2.7 + spec.phase) * 2.4;
    const sway = (base ? 1.2 : 3.2 + index * 0.38) * (spec.foreground ? 1.22 : 1);
    const phase = spec.phase + index * 1.17;
    const speed = 0.46 + (index % 3) * 0.09;
    const mirror = !base && (index + Math.round(spec.phase)) % 2 === 1;
    const object = k.add([
      k.sprite("plant-atlas-v2", { frame: layout.frame }),
      k.pos(rootX + spread, rootY + rootPad),
      k.anchor("bot"),
      k.scale(mirror ? -scale : scale, scale),
      k.rotate(baseAngle),
      k.color(...spec.tint),
      k.opacity(spec.opacity),
      k.z(clusterZ + index * 0.01),
    ]);
    const frond: AnimatedFrond = {
      rootX: rootX + spread,
      rootY,
      height: (layout.bottom - layout.top) * scale,
      phase,
      speed,
      baseAngle,
      sway,
      currentAngle: baseAngle,
      object,
    };
    object.onUpdate(() => {
      const slowCurrent = 0.82 + Math.sin(k.time() * 0.16 + phase * 0.7) * 0.18;
      frond.currentAngle = baseAngle + Math.sin(k.time() * speed + phase) * sway * slowCurrent;
      object.angle = frond.currentAngle;
    });
    fronds.push(frond);
  });

  return { fronds };
}

// The bottom two atlas rows (frames 8-15): ferny/bushy stems and the compact
// tuft/rosette bases, which read well as lone shoots.
const SINGLE_PLANT_KINDS: PlantName[] = [
  "ferny_seaweed_stem",
  "bushy_hornwort_sprig",
  "forked_olive_branch",
  "redgold_feathery_stem",
  "narrow_blade_fan",
  "broadleaf_rosette",
  "irregular_moss_tuft",
  "fiddlehead_shoot",
];

// A single swaying frond rooted on the dune contour. Stratified across the width
// (one per bin, jittered) so the scatter stays balanced instead of clumping.
function spawnSinglePlants(k: KAPLAYCtx, count: number) {
  for (let i = 0; i < count; i++) {
    const fx = (i + k.rand(0.15, 0.85)) / count;
    const rootX = fx * k.width();
    const clampX = Math.max(0, Math.min(k.width() - 1, rootX));
    // near: 0 roots back at the dune line, 1 roots well down the foreground sand,
    // closer to the camera. Root Y, scale, sway and z (via groundZ) all track it
    // so each shoot reads as one distance instead of all sitting on the crest.
    const near = k.rand(0, 1);
    const sandTop = sandTopAt(clampX);
    const rootY = sandTop + 6 * S + near * (k.height() - sandTop) * 0.78;
    const name = k.choose(SINGLE_PLANT_KINDS);
    const layout = PLANT_ATLAS_LAYOUT[name];
    const scale = 0.5 + near * 0.5 + k.rand(0, 0.18);
    const rootPad = (PLANT_ATLAS_CELL - layout.bottom) * scale;
    const baseAngle = k.rand(-6, 6);
    const sway = k.rand(3, 6) * (1 + near * 0.25);
    const phase = k.rand(0, Math.PI * 2);
    const speed = k.rand(0.42, 0.6);
    // Cool-darken slightly with closeness, echoing the foreground clumps.
    const shade = 1 - near * 0.35;
    const tint: [number, number, number] = [k.rand(120, 180) * shade, k.rand(165, 210) * shade, k.rand(150, 190) * shade];
    const object = k.add([
      k.sprite("plant-atlas-v2", { frame: layout.frame }),
      k.pos(rootX, rootY + rootPad),
      k.anchor("bot"),
      k.scale(k.chance(0.5) ? -scale : scale, scale),
      k.rotate(baseAngle),
      k.color(...tint),
      k.opacity(k.rand(0.82, 0.94)),
      k.z(groundZ(rootY)),
    ]);
    object.onUpdate(() => {
      const slowCurrent = 0.82 + Math.sin(k.time() * 0.16 + phase * 0.7) * 0.18;
      object.angle = baseAngle + Math.sin(k.time() * speed + phase) * sway * slowCurrent;
    });
  }
}

// Suspended detritus: tiny pale specks drifting slowly for a sense of depth.
function spawnMotes(k: KAPLAYCtx, count: number) {
  for (let i = 0; i < count; i++) {
    const mote = k.add([
      k.rect(k.rand(1, 2) * S, k.rand(1, 2) * S),
      k.pos(k.rand(0, k.width()), k.rand(0, k.height())),
      k.color(200, 220, 230),
      k.opacity(k.rand(0.05, 0.2)),
      k.z(15),
    ]);
    const drift = k.rand(2, 6) * S;
    const phase = k.rand(0, Math.PI * 2);

    mote.onUpdate(() => {
      mote.pos.y += drift * k.dt();
      mote.pos.x += Math.sin(k.time() * 0.5 + phase) * 0.2 * S;
      if (mote.pos.y > k.height() + 4 * S) {
        mote.pos.y = -4 * S;
        mote.pos.x = k.rand(0, k.width());
      }
    });
  }
}

type BubbleOpts = {
  radius: [number, number];
  rise: [number, number];
  drift: [number, number];
  wobble: number;
  opacity: [number, number];
  z: number;
  life?: number;
};

const PEARL: BubbleOpts = {
  radius: [0.45, 0.9],
  rise: [8, 15],
  drift: [-1.2, 1.2],
  wobble: 2.2,
  opacity: [0.22, 0.4],
  z: 19,
};

const SEEP: BubbleOpts = {
  radius: [0.8, 1.8],
  rise: [11, 22],
  drift: [-2.5, 2.5],
  wobble: 4,
  opacity: [0.22, 0.48],
  z: 24,
};

const RUSTLE: BubbleOpts = {
  radius: [0.55, 1.2],
  rise: [10, 18],
  drift: [-1.8, 1.8],
  wobble: 3.2,
  opacity: [0.18, 0.36],
  z: 18,
};

// A few small bubbles released at a point — used by a fish's surface gulp. Reuses
// the same bubble physics as the ambient sources so they rise and wobble alike.
export function spawnBubble(k: KAPLAYCtx, x: number, y: number, count = 1) {
  for (let i = 0; i < count; i++) {
    emitBubble(k, x + k.rand(-2, 2) * S, y + k.rand(-2, 2) * S, PEARL);
  }
}

function emitBubble(k: KAPLAYCtx, x: number, y: number, o: BubbleOpts) {
  const radius = k.rand(o.radius[0], o.radius[1]) * S;
  const bubble = k.add([
    k.circle(radius),
    k.pos(x, y),
    k.color(210, 235, 255),
    k.opacity(k.rand(o.opacity[0], o.opacity[1])),
    k.z(o.z),
  ]);
  const rise = k.rand(o.rise[0], o.rise[1]) * S;
  const drift = k.rand(o.drift[0], o.drift[1]) * S;
  const wobble = o.wobble * S;
  const phase = k.rand(0, Math.PI * 2);
  const freq = k.rand(1.1, 2.4);
  let age = 0;
  const life = o.life ?? 12;

  bubble.onUpdate(() => {
    const dt = k.dt();
    age += dt;
    bubble.pos.y -= rise * dt;
    bubble.pos.x += (drift + Math.sin(k.time() * freq + phase) * wobble) * dt;
    if (age > life || bubble.pos.y < -radius * 3) bubble.destroy();
  });
}

function spawnPlantPearling(k: KAPLAYCtx, plants: PlantCluster[]) {
  for (const plant of plants) {
    const controller = k.add([k.pos(0, 0)]);
    let timer = k.rand(3, 13);

    controller.onUpdate(() => {
      timer -= k.dt();
      if (timer > 0) return;

      timer = k.rand(8, 24);
      const count = k.randi(1, 3);
      for (let i = 0; i < count; i++) {
        const frond = k.choose(plant.fronds);
        const along = k.rand(0.58, 0.9);
        const angle = (frond.currentAngle * Math.PI) / 180;
        const pt = {
          x: frond.rootX + Math.sin(angle) * frond.height * along,
          y: frond.rootY - Math.cos(angle) * frond.height * along,
        };
        emitBubble(
          k,
          pt.x + k.rand(-0.8, 0.8) * S,
          pt.y + k.rand(-0.8, 0.8) * S,
          PEARL,
        );
      }
    });
  }
}

function spawnSubstrateSeeps(k: KAPLAYCtx, floorY: () => number) {
  const seepPoints = [0.18, 0.34, 0.66, 0.86];
  for (const fx of seepPoints) {
    const controller = k.add([k.pos(0, 0)]);
    let timer = k.rand(12, 55);

    controller.onUpdate(() => {
      timer -= k.dt();
      if (timer > 0) return;

      timer = k.rand(30, 95);
      const large = k.chance(0.25);
      const count = large ? k.randi(1, 2) : k.randi(3, 7);
      for (let i = 0; i < count; i++) {
        emitBubble(
          k,
          fx * k.width() + k.rand(-3, 3) * S,
          floorY() + k.rand(-6, 3) * S,
          large ? { ...SEEP, radius: [1.4, 2.6], rise: [15, 25] } : SEEP,
        );
      }
    });
  }
}

function spawnRuinLeaks(k: KAPLAYCtx) {
  const leaks = [
    { fx: 280 / 640, fy: 160 / 360 },
    { fx: 250 / 640, fy: 158 / 360 },
    { fx: 357 / 640, fy: 93 / 360 },
    { fx: 392 / 640, fy: 214 / 360 },
  ];

  for (const src of leaks) {
    const controller = k.add([k.pos(0, 0)]);
    let timer = k.rand(8, 45);

    controller.onUpdate(() => {
      timer -= k.dt();
      if (timer > 0) return;

      timer = k.rand(24, 80);
      const count = k.randi(2, 8);
      for (let i = 0; i < count; i++) {
        emitBubble(
          k,
          src.fx * k.width() + k.rand(-2, 2) * S,
          src.fy * k.height() + k.rand(-2, 2) * S,
          RUSTLE,
        );
      }
    });
  }
}
