import type { KAPLAYCtx } from "kaplay";
import { RES } from "./res";

const S = RES;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The static scene (dithered water, ruins, coral, sand) is baked once into the
// backdrop sprite (see backdrop.ts). setupTank places that sprite at the back
// and adds the *animated* layers over it: caustics, swaying plants, motes, and
// source-based bubbles. Depth is faked with z-ordering.
export function setupTank(k: KAPLAYCtx) {
  const floorY = () => k.height() * 0.85;

  // The baked backdrop holds everything static; only the layers below animate.
  k.add([k.sprite("backdrop"), k.pos(0, 0), k.z(-200)]);

  // Scenery layout is randomised once at startup; x positions are stored as
  // fractions of width so the scene still fills a resized window.
  const midPlants: Plant[] = Array.from({ length: 7 }, () => ({
    fx: k.rand(0.04, 0.96),
    segs: k.randi(8, 12),
    phase: k.rand(0, Math.PI * 2),
  }));
  const foreKelp: Plant[] = Array.from({ length: 3 }, () => ({
    fx: k.choose([0.03, 0.08, 0.92, 0.97]),
    segs: k.randi(12, 16),
    phase: k.rand(0, Math.PI * 2),
  }));

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

  // Mid seaweed — the lush, lighter strands behind the fish.
  k.add([
    k.pos(0, 0),
    k.z(-45),
    {
      draw() {
        for (const p of midPlants) {
          drawStrand(k, {
            baseX: p.fx * k.width(),
            baseY: floorY() + 3 * S,
            segs: p.segs,
            segH: 4 * S,
            width: 3 * S,
            sway: 5 * S,
            phase: p.phase,
            base: k.rgb(20, 80, 50),
            tip: k.rgb(64, 150, 86),
          });
        }
      },
    },
  ]);

  spawnMotes(k, 30);
  spawnPlantPearling(k, midPlants, floorY);
  spawnSubstrateSeeps(k, floorY);
  spawnRuinLeaks(k);

  // Foreground kelp — large, dark, near-silhouette blades for depth.
  k.add([
    k.pos(0, 0),
    k.z(28),
    {
      draw() {
        for (const p of foreKelp) {
          drawStrand(k, {
            baseX: p.fx * k.width(),
            baseY: k.height() + 4 * S,
            segs: p.segs,
            segH: 6 * S,
            width: 6 * S,
            sway: 8 * S,
            phase: p.phase,
            base: k.rgb(6, 28, 26),
            tip: k.rgb(12, 44, 36),
          });
        }
      },
    },
  ]);
}

type Plant = {
  fx: number;
  segs: number;
  phase: number;
};

type StrandOpts = {
  baseX: number;
  baseY: number;
  segs: number;
  segH: number;
  width: number;
  sway: number;
  phase: number;
  base: ReturnType<KAPLAYCtx["rgb"]>;
  tip: ReturnType<KAPLAYCtx["rgb"]>;
};

// One swaying plant strand: stacked segments that taper toward the tip, lean
// more the higher they are, and fade from a dark base color to a lighter tip.
function drawStrand(k: KAPLAYCtx, o: StrandOpts) {
  for (let i = 0; i < o.segs; i++) {
    const t = i / o.segs;
    const sway = Math.sin(k.time() * 1.1 + i * 0.45 + o.phase) * o.sway * t;
    k.drawRect({
      pos: k.vec2(o.baseX + sway, o.baseY - i * o.segH),
      width: Math.max(1, o.width * (1 - t * 0.6)),
      height: o.segH + 1 * S,
      anchor: "center",
      color: k.rgb(
        lerp(o.base.r, o.tip.r, t),
        lerp(o.base.g, o.tip.g, t),
        lerp(o.base.b, o.tip.b, t),
      ),
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

function plantPoint(
  k: KAPLAYCtx,
  p: Plant,
  baseY: number,
  segH: number,
  sway: number,
  seg: number,
) {
  const t = seg / p.segs;
  return {
    x: p.fx * k.width() + Math.sin(k.time() * 1.1 + seg * 0.45 + p.phase) * sway * t,
    y: baseY - seg * segH,
  };
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

function spawnPlantPearling(
  k: KAPLAYCtx,
  plants: Plant[],
  floorY: () => number,
) {
  for (const p of plants) {
    const controller = k.add([k.pos(0, 0)]);
    let timer = k.rand(3, 13);

    controller.onUpdate(() => {
      timer -= k.dt();
      if (timer > 0) return;

      timer = k.rand(8, 24);
      const count = k.randi(1, 3);
      for (let i = 0; i < count; i++) {
        const seg = k.randi(Math.floor(p.segs * 0.55), p.segs - 1);
        const pt = plantPoint(k, p, floorY() + 3 * S, 4 * S, 5 * S, seg);
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
