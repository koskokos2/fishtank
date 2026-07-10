import type { KAPLAYCtx } from "kaplay";
import { RES } from "./res";

const S = RES;
// Matches the shadow, body, and lit sand colours in backdrop.ts.
const SAND_PUFF: [number, number, number][] = [
  [120, 96, 56],
  [180, 148, 88],
  [206, 176, 110],
];

type Grain = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  originY: number;
  age: number;
  size: number;
  tone: [number, number, number];
  opacity: number;
};

// A short-lived burst of crisp sand grains. Scale controls particle count, while
// riseMul and settleMul let a heavy landing and a tiny crawling scuff share the
// same effect without looking equally forceful. grainBoost increases each crisp
// particle by whole pixels when a very small creature needs a more readable trail.
// The whole burst lives in one game object holding plain grain structs — a burst
// can be several hundred grains, and per-grain objects made every puff a spike of
// adds/destroys and closures.
export function spawnSandPuff(
  k: KAPLAYCtx,
  x: number,
  sandY: number,
  scale = 1,
  riseMul = 1,
  settleMul = 1,
  grainBoost = 0,
) {
  const minN = Math.max(2, Math.round(112 * scale));
  const maxN = Math.max(minN + 1, Math.round(176 * scale));
  const n = k.randi(minN, maxN);
  const grains: Grain[] = [];
  for (let i = 0; i < n; i++) {
    const y = sandY - k.rand(0, 3) * S;
    grains.push({
      x: x + k.rand(-16, 16) * S,
      y,
      vx: k.rand(-14, 14) * S,
      vy: -k.rand(16, 34) * S * riseMul,
      gravity: (k.rand(34, 54) * S) / Math.max(0.01, settleMul),
      originY: y,
      age: 0,
      size: k.randi(1, 3) + grainBoost,
      tone: k.choose(SAND_PUFF),
      opacity: k.rand(0.75, 1),
    });
  }

  const drag = 2.6;
  const puff = k.add([
    k.pos(0, 0),
    k.z(19),
    {
      update() {
        const dt = k.dt();
        for (let i = grains.length - 1; i >= 0; i--) {
          const g = grains[i];
          g.age += dt;
          g.vy += g.gravity * dt;
          g.vx -= g.vx * drag * dt;
          g.vy -= g.vy * drag * dt;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          if (g.age > 0.6 * settleMul)
            g.opacity -= dt * (0.7 / Math.max(0.01, settleMul));
          if (
            (g.vy > 0 && g.y >= g.originY) ||
            g.age > 2.4 * settleMul ||
            g.opacity <= 0
          ) {
            grains[i] = grains[grains.length - 1];
            grains.pop();
          }
        }
        if (grains.length === 0) puff.destroy();
      },
      draw() {
        for (const g of grains)
          k.drawRect({
            pos: k.vec2(g.x, g.y),
            width: g.size,
            height: g.size,
            color: k.rgb(g.tone[0], g.tone[1], g.tone[2]),
            opacity: g.opacity,
          });
      },
    },
  ]);
}
