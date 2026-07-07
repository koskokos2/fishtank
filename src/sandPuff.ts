import type { KAPLAYCtx } from "kaplay";
import { RES } from "./res";

const S = RES;
// Matches the shadow, body, and lit sand colours in backdrop.ts.
const SAND_PUFF: [number, number, number][] = [
  [120, 96, 56],
  [180, 148, 88],
  [206, 176, 110],
];

// A short-lived burst of crisp sand grains. Scale controls particle count, while
// riseMul and settleMul let a heavy landing and a tiny crawling scuff share the
// same effect without looking equally forceful. grainBoost increases each crisp
// particle by whole pixels when a very small creature needs a more readable trail.
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
  for (let i = 0; i < n; i++) {
    const sz = k.randi(1, 3) + grainBoost;
    const tone = k.choose(SAND_PUFF);
    const grain = k.add([
      k.rect(sz, sz),
      k.pos(x + k.rand(-16, 16) * S, sandY - k.rand(0, 3) * S),
      k.color(tone[0], tone[1], tone[2]),
      k.opacity(k.rand(0.75, 1)),
      k.z(19),
    ]);
    let vx = k.rand(-14, 14) * S;
    let vy = -k.rand(16, 34) * S * riseMul;
    const gravity =
      (k.rand(34, 54) * S) / Math.max(0.01, settleMul);
    const drag = 2.6;
    const originY = grain.pos.y;
    let age = 0;

    grain.onUpdate(() => {
      const dt = k.dt();
      age += dt;
      vy += gravity * dt;
      vx -= vx * drag * dt;
      vy -= vy * drag * dt;
      grain.pos.x += vx * dt;
      grain.pos.y += vy * dt;
      if (age > 0.6 * settleMul)
        grain.opacity -= dt * (0.7 / Math.max(0.01, settleMul));
      if (
        (vy > 0 && grain.pos.y >= originY) ||
        age > 2.4 * settleMul ||
        grain.opacity <= 0
      )
        grain.destroy();
    });
  }
}
