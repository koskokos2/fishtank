import type { KAPLAYCtx, Quad, Vec2, Color } from "kaplay";
import { RES } from "./res";
import { groundZ, sandTopAt } from "./backdrop";
import {
  WATER_LIGHT_SHADER,
  WATER_LIGHTING_TUNING,
  sunEmitterX,
} from "./waterLighting";
import { PLANT_ATLAS_CELL, PLANT_ATLAS_LAYOUT } from "./plantAtlas";
import { spawnFixedProps, spawnRotatingProps } from "./propPlacement";
import {
  off,
  profile,
  profileDraw,
  profileDrawEnd,
  withDrawProfile,
} from "./profiling";

const S = RES;
type TankEntityCounts = Readonly<{ plants: number }>;

// The static scene is baked once into two sprites (see backdrop.ts): the
// water back plate and a transparent sand overlay (the dunes).
// setupTank places those at the back and adds the *animated* layers over them:
// shader-driven surface light, swaying plants, motes, and source-based bubbles.
// Depth is faked with z-ordering.
export function setupTank(k: KAPLAYCtx, counts: TankEntityCounts) {
  // The baked layers hold everything static; only the layers below animate.
  // The gap between the two z values is where far plants (the luminous kelp)
  // live, so the dune crest occludes their roots.
  if (!off("backdrop")) {
    const waterLightUniform = { u_time: 0, u_emitterX: sunEmitterX() };
    k.add([
      profileDraw("backdrop"),
      k.sprite("backdrop"),
      profileDrawEnd(),
      k.pos(0, 0),
      k.z(-200),
      // Keep the existing ?off=caustics ablation switch even though the old
      // CPU caustics texture is now a water-surface and god-ray shader.
      ...(off("caustics")
        ? []
        : [
            k.shader(WATER_LIGHT_SHADER, () => {
              // Every shader animation coefficient is an integer hundredth, so
              // 200π seconds is a seamless common period. Keeping the uniform
              // bounded prevents long-running tabs from losing phase precision
              // differently across WebGL backends.
              waterLightUniform.u_time =
                k.time() % WATER_LIGHTING_TUNING.animationLoopSeconds;
              // Re-sampled every frame so the emitter drifts with the real
              // clock across the day without a reload.
              waterLightUniform.u_emitterX = sunEmitterX();
              return waterLightUniform;
            }),
          ]),
    ]);
  }
  if (!off("sand"))
    k.add([
      profileDraw("sand"),
      k.sprite("backdrop-sand"),
      profileDrawEnd(),
      k.pos(0, 0),
      k.z(-150),
    ]);

  // Six live prop slots draw from the combined whitelist. One random occupant
  // is replaced by a different whitelisted prop every five minutes.
  if (!off("props")) {
    spawnRotatingProps(k);

    // The two display consoles stay put, outside the rotating slots.
    spawnFixedProps(k);
  }

  // Atlas plants keep the good depth language of the old procedural grass, but
  // each real frond now has its own root pivot and current phase. Their roots use
  // the actual dune contour and sit several pixels inside the dense sand, where
  // the atlas' dithered alpha edge reveals the procedural substrate beneath.
  // The shared plants budget fills mid clusters first, then foreground clumps,
  // then the lone shoots.
  const plantBudget = off("plants") ? 0 : counts.plants;
  // Every frond is collected into one flat list, then committed as a handful of
  // z-banded draw controllers (see commitPlantField) instead of one game object
  // per frond. On weak GPUs the per-object scene-graph walk — not the pixels —
  // is the cost, so collapsing ~150 plant entities into a few controllers is the
  // single biggest Pi win while keeping every frond on screen.
  const fronds: Frond[] = [];
  const midPlants = MID_PLANTS.slice(0, plantBudget).map((spec) =>
    collectPlantCluster(k, spec, fronds),
  );
  FOREGROUND_PLANTS.slice(
    0,
    Math.max(0, plantBudget - MID_PLANTS.length),
  ).forEach((spec) => collectPlantCluster(k, spec, fronds));

  // Lone shoots scattered between the clusters so the seabed reads as evenly
  // planted rather than tufted only at the set piece clumps.
  const singleShoots =
    plantBudget - MID_PLANTS.length - FOREGROUND_PLANTS.length;
  if (singleShoots > 0) collectSinglePlants(k, singleShoots, fronds);

  commitPlantField(k, fronds);

  if (!off("motes")) spawnMotes(k, 30);
  // Fresh pools per scene build so a dev reload can't leave controllers from a
  // previous scene holding stale bubble structs.
  bubblePools.clear();
  bubbleColor = null;
  if (!off("bubbles")) {
    spawnPlantPearling(k, midPlants);
    spawnSubstrateSeeps(k);
    spawnRuinLeaks(k);
  }
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

// One swaying frond. The animation fields drive the sway; the draw fields feed a
// single batched k.drawSprite; rootX/rootY/height/currentAngle are read back by
// the pearling emitters. No per-frond game object exists — commitPlantField draws
// the whole field from a few controllers.
type Frond = {
  rootX: number;
  rootY: number;
  height: number;
  phase: number;
  speed: number;
  baseAngle: number;
  sway: number;
  currentAngle: number;
  drawX: number;
  drawY: number;
  scaleX: number;
  scaleY: number;
  frame: number;
  tint: [number, number, number];
  opacity: number;
  z: number;
};

type PlantCluster = {
  fronds: Frond[];
};

export const MID_PLANTS: PlantSpec[] = [
  {
    fx: 0.025,
    depth: 7,
    scale: 0.82,
    theme: "ribbon",
    phase: 0.4,
    tint: [118, 164, 151],
    opacity: 0.78,
  },
  {
    fx: 0.12,
    depth: 13,
    scale: 1.04,
    theme: "mixed",
    phase: 1.5,
    tint: [190, 216, 193],
    opacity: 0.94,
  },
  {
    fx: 0.235,
    depth: 10,
    scale: 0.9,
    theme: "fern",
    phase: 3.1,
    tint: [147, 190, 163],
    opacity: 0.88,
  },
  {
    fx: 0.46,
    depth: 12,
    scale: 0.96,
    theme: "broad",
    phase: 4.4,
    tint: [182, 212, 188],
    opacity: 0.92,
  },
  {
    fx: 0.64,
    depth: 8,
    scale: 0.84,
    theme: "ribbon",
    phase: 2.35,
    tint: [126, 174, 158],
    opacity: 0.82,
  },
  {
    fx: 0.81,
    depth: 14,
    scale: 1.08,
    theme: "fern",
    phase: 5.5,
    tint: [181, 207, 181],
    opacity: 0.92,
  },
  {
    fx: 0.965,
    depth: 10,
    scale: 0.92,
    theme: "mixed",
    phase: 0.9,
    tint: [145, 186, 166],
    opacity: 0.86,
  },
];

// Like the old near-camera grass, these oversized edge clumps sit in front of
// the animals and are heavily cool-darkened. Keeping them at the side preserves
// a clear central swimming window while giving the tank genuine depth.
export const FOREGROUND_PLANTS: PlantSpec[] = [
  {
    fx: -0.018,
    depth: 9,
    scale: 1.78,
    theme: "broad",
    phase: 0.2,
    tint: [35, 59, 55],
    opacity: 0.96,
    z: 32,
    foreground: true,
  },
  {
    fx: 0.055,
    depth: 8,
    scale: 1.42,
    theme: "ribbon",
    phase: 2.1,
    tint: [42, 69, 62],
    opacity: 0.94,
    z: 31,
    foreground: true,
  },
  {
    fx: 0.95,
    depth: 8,
    scale: 1.5,
    theme: "fern",
    phase: 4.2,
    tint: [39, 66, 60],
    opacity: 0.95,
    z: 31,
    foreground: true,
  },
  {
    fx: 1.018,
    depth: 10,
    scale: 1.9,
    theme: "mixed",
    phase: 5.8,
    tint: [31, 54, 51],
    opacity: 0.97,
    z: 33,
    foreground: true,
  },
];

export const THEME_FRONDS: Record<PlantTheme, PlantName[]> = {
  ribbon: [
    "eelgrass_left_arc",
    "eelgrass_s_curve",
    "eelgrass_upright_wave",
    "eelgrass_right_arc",
    "bluegreen_lance_leaf",
  ],
  broad: [
    "emerald_strap_leaf",
    "bluegreen_lance_leaf",
    "jagged_olive_kelp",
    "eelgrass_s_curve",
    "burgundy_accent_leaf",
  ],
  fern: [
    "ferny_seaweed_stem",
    "bushy_hornwort_sprig",
    "forked_olive_branch",
    "eelgrass_upright_wave",
    "redgold_feathery_stem",
  ],
  mixed: [
    "eelgrass_left_arc",
    "emerald_strap_leaf",
    "ferny_seaweed_stem",
    "eelgrass_right_arc",
    "forked_olive_branch",
    "jagged_olive_kelp",
  ],
};

export const THEME_BASE: Record<PlantTheme, PlantName> = {
  ribbon: "narrow_blade_fan",
  broad: "broadleaf_rosette",
  fern: "irregular_moss_tuft",
  mixed: "fiddlehead_shoot",
};

function collectPlantCluster(
  k: KAPLAYCtx,
  spec: PlantSpec,
  out: Frond[],
): PlantCluster {
  const rootX = spec.fx * k.width();
  const rootY = spec.foreground
    ? k.height() + spec.depth * S
    : sandTopAt(Math.max(0, Math.min(k.width() - 1, rootX))) + spec.depth * S;
  const names = [...THEME_FRONDS[spec.theme], THEME_BASE[spec.theme]];
  const centre = (names.length - 2) / 2;
  const clusterZ = spec.foreground ? spec.z! : groundZ(rootY);
  const fronds: Frond[] = [];

  names.forEach((name, index) => {
    const base = index === names.length - 1;
    const side = base ? 0 : index - centre;
    const spread = side * 2.1 * S * spec.scale;
    const centreBoost = base
      ? 0.72
      : 0.78 + (1 - Math.abs(side) / (centre + 1)) * 0.28;
    const scale = spec.scale * centreBoost;
    const layout = PLANT_ATLAS_LAYOUT[name];
    const rootPad = (PLANT_ATLAS_CELL - layout.bottom) * scale;
    const baseAngle = base
      ? 0
      : side * 4.8 + Math.sin(index * 2.7 + spec.phase) * 2.4;
    const sway =
      (base ? 1.2 : 3.2 + index * 0.38) * (spec.foreground ? 1.22 : 1);
    const phase = spec.phase + index * 1.17;
    const speed = 0.46 + (index % 3) * 0.09;
    const mirror = !base && (index + Math.round(spec.phase)) % 2 === 1;
    const frond: Frond = {
      rootX: rootX + spread,
      rootY,
      height: (layout.bottom - layout.top) * scale,
      phase,
      speed,
      baseAngle,
      sway,
      currentAngle: baseAngle,
      drawX: rootX + spread,
      drawY: rootY + rootPad,
      scaleX: mirror ? -scale : scale,
      scaleY: scale,
      frame: layout.frame,
      tint: spec.tint,
      opacity: spec.opacity,
      z: clusterZ + index * 0.01,
    };
    fronds.push(frond);
    out.push(frond);
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
function collectSinglePlants(k: KAPLAYCtx, count: number, out: Frond[]) {
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
    const scale = k.rand(0.2, 1.0);
    const rootPad = (PLANT_ATLAS_CELL - layout.bottom) * scale;
    const baseAngle = k.rand(-6, 6);
    const sway = k.rand(3, 6) * (1 + near * 0.25);
    const phase = k.rand(0, Math.PI * 2);
    const speed = k.rand(0.42, 0.6);
    // Cool-darken slightly with closeness, echoing the foreground clumps.
    const shade = 1 - near * 0.35;
    const tint: [number, number, number] = [
      k.rand(120, 180) * shade,
      k.rand(165, 210) * shade,
      k.rand(150, 190) * shade,
    ];
    out.push({
      rootX,
      rootY,
      height: (layout.bottom - layout.top) * scale,
      phase,
      speed,
      baseAngle,
      sway,
      currentAngle: baseAngle,
      drawX: rootX,
      drawY: rootY + rootPad,
      scaleX: k.chance(0.5) ? -scale : scale,
      scaleY: scale,
      frame: layout.frame,
      tint,
      opacity: k.rand(0.82, 0.94),
      z: groundZ(rootY),
    });
  }
}

// One frond ready to draw: its live sway source plus every constant hoisted out
// of the per-frame hot loop. pos/scale/color/quad/size never change, so they are
// built once here rather than reallocated each frame (matters ~10x more on the
// Pi's JavaScriptCore than on a fast desktop GPU/JIT).
type FrondDraw = {
  frond: Frond;
  quad?: Quad;
  width: number;
  height: number;
  pos: Vec2;
  scale: Vec2;
  color: Color;
  opacity: number;
};

// Draw the whole plant field from a few z-banded controllers instead of one
// game object per frond. Fronds are bucketed into coarse depth bands so they
// still interleave with fish by depth (a fish occludes a band it swims nearer
// than), while ~150 scene-graph nodes collapse to a handful. Within a band the
// fronds are sorted by exact z so nearer fronds overlay farther ones, and all
// draw straight from the shared plant-atlas texture via drawUVQuad so Kaplay
// batches them into few draw calls — bypassing drawSprite's per-frond string
// lookup and per-call object allocation.
function commitPlantField(k: KAPLAYCtx, fronds: Frond[]) {
  if (!fronds.length) return;
  // Resolved once: setupTank runs in onLoad, so the atlas is ready. tex + frame
  // quads let us feed drawUVQuad directly; drawSprite(frame) is equivalent to
  // drawUVQuad with quad=frame and size=tex.wh*frame.wh, but re-resolves by name
  // and allocates a fresh opts object every frond every frame.
  const data = k.getSprite("plant-atlas-v2")?.data;
  const BAND = 6;
  const bands = new Map<number, Frond[]>();
  for (const frond of fronds) {
    const key = Math.round(frond.z / BAND) * BAND;
    const group = bands.get(key);
    if (group) group.push(frond);
    else bands.set(key, [frond]);
  }

  for (const [bandZ, group] of bands) {
    group.sort((a, b) => a.z - b.z);
    const items: FrondDraw[] = group.map((frond) => {
      const quad = data?.frames[frond.frame];
      return {
        frond,
        quad,
        width: data && quad ? data.tex.width * quad.w : 0,
        height: data && quad ? data.tex.height * quad.h : 0,
        pos: k.vec2(frond.drawX, frond.drawY),
        scale: k.vec2(frond.scaleX, frond.scaleY),
        color: k.rgb(frond.tint[0], frond.tint[1], frond.tint[2]),
        opacity: frond.opacity,
      };
    });
    k.add([
      k.z(bandZ),
      {
        update() {
          profile("plants", () => {
            const t = k.time();
            for (const f of group) {
              const slowCurrent =
                0.82 + Math.sin(t * 0.16 + f.phase * 0.7) * 0.18;
              f.currentAngle =
                f.baseAngle +
                Math.sin(t * f.speed + f.phase) * f.sway * slowCurrent;
            }
          });
        },
        draw() {
          withDrawProfile("plants", () => {
            if (data) {
              for (const it of items)
                k.drawUVQuad({
                  tex: data.tex,
                  quad: it.quad,
                  width: it.width,
                  height: it.height,
                  pos: it.pos,
                  anchor: "bot",
                  scale: it.scale,
                  angle: it.frond.currentAngle,
                  color: it.color,
                  opacity: it.opacity,
                });
              return;
            }
            // Fallback if the atlas somehow isn't resolved yet.
            for (const it of items)
              k.drawSprite({
                sprite: "plant-atlas-v2",
                frame: it.frond.frame,
                pos: it.pos,
                anchor: "bot",
                scale: it.scale,
                angle: it.frond.currentAngle,
                color: it.color,
                opacity: it.opacity,
              });
          });
        },
      },
    ]);
  }
}

// Suspended detritus: tiny pale specks drifting slowly for a sense of depth.
// Drawn from one controller instead of a game object per speck — the specks are
// just structs the controller drifts and paints via drawRect, collapsing ~30
// scene-graph nodes (and their per-object update/draw walks) into one.
type Mote = {
  pos: Vec2;
  drift: number;
  phase: number;
  w: number;
  h: number;
  opacity: number;
};

function spawnMotes(k: KAPLAYCtx, count: number) {
  if (count <= 0) return;
  const motes: Mote[] = [];
  for (let i = 0; i < count; i++) {
    motes.push({
      pos: k.vec2(k.rand(0, k.width()), k.rand(0, k.height())),
      drift: k.rand(2, 6) * S,
      phase: k.rand(0, Math.PI * 2),
      w: k.rand(1, 2) * S,
      h: k.rand(1, 2) * S,
      opacity: k.rand(0.05, 0.2),
    });
  }
  const color = k.rgb(200, 220, 230);

  k.add([
    k.z(15),
    {
      update() {
        profile("motes", () => {
          const dt = k.dt();
          const t = k.time();
          const h = k.height();
          for (const m of motes) {
            m.pos.y += m.drift * dt;
            m.pos.x += Math.sin(t * 0.5 + m.phase) * 0.2 * S;
            if (m.pos.y > h + 4 * S) {
              m.pos.y = -4 * S;
              m.pos.x = k.rand(0, k.width());
            }
          }
        });
      },
      draw() {
        withDrawProfile("motes", () => {
          for (const m of motes)
            k.drawRect({
              width: m.w,
              height: m.h,
              pos: m.pos,
              color,
              opacity: m.opacity,
            });
        });
      },
    },
  ]);
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

// One pooled bubble. Spent bubbles are flagged inactive and their slot reused,
// so the constant emit/expire cycle allocates nothing after warm-up.
type Bubble = {
  active: boolean;
  pos: Vec2;
  radius: number;
  rise: number;
  drift: number;
  wobble: number;
  phase: number;
  freq: number;
  age: number;
  life: number;
  opacity: number;
};

// Ambient bubbles are pooled and drawn from one controller per depth (z) instead
// of a game object add()/destroy()'d per bubble. That churn was pure GC pressure
// — brutal on the Pi's collector — for what is only a translucent circle. Pools
// are keyed by z so bubbles still layer correctly against the rest of the scene.
type BubblePool = { bubbles: Bubble[] };
const BUBBLE_COLOR = [210, 235, 255] as const;
let bubbleColor: Color | null = null;
const bubblePools = new Map<number, BubblePool>();

function bubblePoolFor(k: KAPLAYCtx, z: number): BubblePool {
  const existing = bubblePools.get(z);
  if (existing) return existing;
  const pool: BubblePool = { bubbles: [] };
  bubblePools.set(z, pool);
  k.add([
    k.z(z),
    {
      update() {
        profile("bubbles", () => {
          const dt = k.dt();
          const t = k.time();
          for (const b of pool.bubbles) {
            if (!b.active) continue;
            b.age += dt;
            b.pos.y -= b.rise * dt;
            b.pos.x +=
              (b.drift + Math.sin(t * b.freq + b.phase) * b.wobble) * dt;
            if (b.age > b.life || b.pos.y < -b.radius * 3) b.active = false;
          }
        });
      },
      draw() {
        withDrawProfile("bubbles", () => {
          for (const b of pool.bubbles) {
            if (!b.active) continue;
            k.drawCircle({
              radius: b.radius,
              pos: b.pos,
              color: bubbleColor!,
              opacity: b.opacity,
            });
          }
        });
      },
    },
  ]);
  return pool;
}

function emitBubble(k: KAPLAYCtx, x: number, y: number, o: BubbleOpts) {
  if (!bubbleColor) bubbleColor = k.rgb(...BUBBLE_COLOR);
  const pool = bubblePoolFor(k, o.z);
  let b = pool.bubbles.find((bb) => !bb.active);
  if (!b) {
    b = {
      active: false,
      pos: k.vec2(0, 0),
      radius: 0,
      rise: 0,
      drift: 0,
      wobble: 0,
      phase: 0,
      freq: 0,
      age: 0,
      life: 0,
      opacity: 0,
    };
    pool.bubbles.push(b);
  }
  b.active = true;
  b.pos.x = x;
  b.pos.y = y;
  b.radius = k.rand(o.radius[0], o.radius[1]) * S;
  b.rise = k.rand(o.rise[0], o.rise[1]) * S;
  b.drift = k.rand(o.drift[0], o.drift[1]) * S;
  b.wobble = o.wobble * S;
  b.phase = k.rand(0, Math.PI * 2);
  b.freq = k.rand(1.1, 2.4);
  b.age = 0;
  b.life = o.life ?? 12;
  b.opacity = k.rand(o.opacity[0], o.opacity[1]);
}

function spawnPlantPearling(k: KAPLAYCtx, plants: PlantCluster[]) {
  for (const plant of plants) {
    const controller = k.add([k.pos(0, 0)]);
    let timer = k.rand(3, 13);

    controller.onUpdate(() =>
      profile("bubbles", () => {
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
      }),
    );
  }
}

function spawnSubstrateSeeps(k: KAPLAYCtx) {
  const seepPoints = [0.18, 0.34, 0.66, 0.86];
  for (const fx of seepPoints) {
    const controller = k.add([k.pos(0, 0)]);
    let timer = k.rand(12, 55);

    controller.onUpdate(() =>
      profile("bubbles", () => {
        timer -= k.dt();
        if (timer > 0) return;

        timer = k.rand(30, 95);
        const large = k.chance(0.25);
        const count = large ? k.randi(1, 2) : k.randi(3, 7);
        for (let i = 0; i < count; i++) {
          const x = fx * k.width() + k.rand(-3, 3) * S;
          const sandTop = sandTopAt(Math.max(0, Math.min(k.width() - 1, x)));
          emitBubble(
            k,
            x,
            sandTop + k.rand(-6, 3) * S,
            large ? { ...SEEP, radius: [1.4, 2.6], rise: [15, 25] } : SEEP,
          );
        }
      }),
    );
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

    controller.onUpdate(() =>
      profile("bubbles", () => {
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
      }),
    );
  }
}
