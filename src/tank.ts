import type { KAPLAYCtx } from "kaplay";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The static scene (dithered water, ruins, coral, sand) is baked once into the
// backdrop sprite (see backdrop.ts). setupTank places that sprite at the back
// and adds the *animated* layers over it: caustics, swaying plants, motes, and
// bubbles. Depth is faked with z-ordering.
export function setupTank(k: KAPLAYCtx) {
  const floorY = () => k.height() * 0.85;

  // The baked backdrop holds everything static; only the layers below animate.
  k.add([k.sprite("backdrop"), k.pos(0, 0), k.z(-200)]);

  // Scenery layout is randomised once at startup; x positions are stored as
  // fractions of width so the scene still fills a resized window.
  const midPlants = Array.from({ length: 7 }, () => ({
    fx: k.rand(0.04, 0.96),
    segs: k.randi(8, 12),
    phase: k.rand(0, Math.PI * 2),
  }));
  const foreKelp = Array.from({ length: 3 }, () => ({
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
        const cell = 12;
        const t = k.time();
        for (let x = 0; x < w; x += cell) {
          for (let y = 0; y < h * 0.6; y += cell) {
            const v =
              Math.sin(x * 0.05 + t) +
              Math.sin(y * 0.07 - t * 0.8) +
              Math.sin((x + y) * 0.04 + t * 1.3);
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
            baseY: floorY() + 3,
            segs: p.segs,
            segH: 4,
            width: 3,
            sway: 5,
            phase: p.phase,
            base: k.rgb(20, 80, 50),
            tip: k.rgb(64, 150, 86),
          });
        }
      },
    },
  ]);

  spawnMotes(k, 30);

  // Foreground kelp — large, dark, near-silhouette blades for depth.
  k.add([
    k.pos(0, 0),
    k.z(28),
    {
      draw() {
        for (const p of foreKelp) {
          drawStrand(k, {
            baseX: p.fx * k.width(),
            baseY: k.height() + 4,
            segs: p.segs,
            segH: 6,
            width: 6,
            sway: 8,
            phase: p.phase,
            base: k.rgb(6, 28, 26),
            tip: k.rgb(12, 44, 36),
          });
        }
      },
    },
  ]);

  spawnBubbles(k, 26);
}

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
      height: o.segH + 1,
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
      k.rect(k.rand(1, 2), k.rand(1, 2)),
      k.pos(k.rand(0, k.width()), k.rand(0, k.height())),
      k.color(200, 220, 230),
      k.opacity(k.rand(0.05, 0.2)),
      k.z(15),
    ]);
    const drift = k.rand(2, 6);
    const phase = k.rand(0, Math.PI * 2);

    mote.onUpdate(() => {
      mote.pos.y += drift * k.dt();
      mote.pos.x += Math.sin(k.time() * 0.5 + phase) * 0.2;
      if (mote.pos.y > k.height() + 4) {
        mote.pos.y = -4;
        mote.pos.x = k.rand(0, k.width());
      }
    });
  }
}

function spawnBubbles(k: KAPLAYCtx, count: number) {
  for (let i = 0; i < count; i++) {
    const bubble = k.add([
      k.circle(k.rand(1, 2.5)),
      k.pos(k.rand(0, k.width()), k.rand(0, k.height())),
      k.color(200, 230, 255),
      k.opacity(k.rand(0.2, 0.5)),
      k.z(30),
    ]);
    const rise = k.rand(12, 28);
    const phase = k.rand(0, Math.PI * 2);

    bubble.onUpdate(() => {
      bubble.pos.y -= rise * k.dt();
      bubble.pos.x += Math.sin(k.time() * 2 + phase) * 0.3;
      if (bubble.pos.y < -10) {
        bubble.pos.y = k.height() + 10;
        bubble.pos.x = k.rand(0, k.width());
      }
    });
  }
}
