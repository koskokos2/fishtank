import type { KAPLAYCtx, Color, Vec2 } from "kaplay";
import { off, profile, registerDebugStat, withDrawProfile } from "./profiling";
import { RES } from "./res";
import { groundZ } from "./backdrop";

const S = RES;
// Matches the shadow, body, and lit sand colours in backdrop.ts.
const SAND_PUFF: [number, number, number][] = [
  [120, 96, 56],
  [180, 148, 88],
  [206, 176, 110],
];

// The three sand tones resolved to shared Color objects once (needs a k), so the
// hot per-grain draw reuses them instead of allocating a Color every frame.
let toneColors: Color[] | null = null;

type Grain = {
  pos: Vec2;
  vx: number;
  vy: number;
  gravity: number;
  originY: number;
  age: number;
  size: number;
  color: Color;
  opacity: number;
};

let activeBursts = 0;
let activeGrains = 0;
registerDebugStat(
  "puffs",
  () => `${activeBursts} bursts ${activeGrains} grains`,
);

// A short-lived burst of crisp sand grains. Scale controls particle count, while
// riseMul and settleMul let a heavy landing and a tiny crawling scuff share the
// same effect without looking equally forceful. grainBoost increases each crisp
// particle by whole pixels when a very small creature needs a more readable trail.
// surfaceAt anchors each grain to a sloping bed instead of a flat contact plane.
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
  surfaceAt?: (x: number) => number,
) {
  if (off("puffs")) return;
  if (!toneColors)
    toneColors = SAND_PUFF.map((t) => k.rgb(t[0], t[1], t[2]));

  const minN = Math.max(2, Math.round(112 * scale));
  const maxN = Math.max(minN + 1, Math.round(176 * scale));
  const n = k.randi(minN, maxN);
  const grains: Grain[] = [];
  for (let i = 0; i < n; i++) {
    const grainX = x + k.rand(-16, 16) * S;
    const y = surfaceAt
      ? surfaceAt(grainX) + k.rand(0, 1) * S
      : sandY - k.rand(0, 3) * S;
    grains.push({
      pos: k.vec2(grainX, y),
      vx: k.rand(-14, 14) * S,
      vy: -k.rand(16, 34) * S * riseMul,
      gravity: (k.rand(34, 54) * S) / Math.max(0.01, settleMul),
      originY: y,
      age: 0,
      size: k.randi(1, 3) + grainBoost,
      color: k.choose(toneColors),
      opacity: k.rand(0.75, 1),
    });
  }
  activeBursts++;
  activeGrains += grains.length;

  const drag = 2.6;
  const puff = k.add([
    k.pos(0, 0),
    // Sort by the disturbed sand's contact depth, like grounded creatures and
    // props. Keep this fixed as grains rise: crest puffs belong behind the head,
    // while puffs from the foreground sand remain in front of it.
    k.z(groundZ(sandY) + 0.01),
    {
      update() {
        profile("puffs", () => {
          const dt = k.dt();
          for (let i = grains.length - 1; i >= 0; i--) {
            const g = grains[i];
            g.age += dt;
            g.vy += g.gravity * dt;
            g.vx -= g.vx * drag * dt;
            g.vy -= g.vy * drag * dt;
            g.pos.x += g.vx * dt;
            g.pos.y += g.vy * dt;
            if (g.age > 0.6 * settleMul)
              g.opacity -= dt * (0.7 / Math.max(0.01, settleMul));
            if (
              (g.vy > 0 && g.pos.y >= g.originY) ||
              g.age > 2.4 * settleMul ||
              g.opacity <= 0
            ) {
              grains[i] = grains[grains.length - 1];
              grains.pop();
              activeGrains--;
            }
          }
          if (grains.length === 0) {
            puff.destroy();
          }
        });
      },
      draw() {
        withDrawProfile("puffs", () => {
          for (const g of grains)
            k.drawRect({
              pos: g.pos,
              width: g.size,
              height: g.size,
              color: g.color,
              opacity: g.opacity,
            });
        });
      },
    },
  ]);
  puff.tag("sand-puff");
  puff.onDestroy(() => {
    activeBursts--;
    activeGrains -= grains.length;
  });
}
