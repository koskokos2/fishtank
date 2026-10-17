import { afterEach, expect, test } from "bun:test";
import { cityRelicFootprints } from "../src/cityDuneRelic";
import { clampLandmarkPath, clampPathX, insidePropFootprint, nearestClearX, setCityRelicObstacles } from "../src/propPlacement";
import { RES, VW } from "../src/res";
import { sandTopAt } from "../src/backdrop";
import { maxSubstrateDepthAt } from "../src/substrate";

afterEach(() => setCityRelicObstacles(null));
const half = 30, gap = 2 * RES;

test("head reserves its buried contour, with foreground sand left open", () => {
  setCityRelicObstacles(cityRelicFootprints());
  const parts = cityRelicFootprints();
  const deepest = Math.max(...parts.map(part => part.maxDepth));
  for (const part of parts) {
    const x = Math.max(12 * RES, (part.x0 + part.x1) / 2);
    for (const depth of [0, 20 * RES, part.maxDepth]) {
      expect(insidePropFootprint(x, half, depth)).toBe(true);
      const clear = nearestClearX(x, half, gap, depth, 12 * RES, VW - 12 * RES);
      expect(insidePropFootprint(clear, half, depth)).toBe(false);
    }
    expect(insidePropFootprint(x, half, deepest + gap)).toBe(false);
  }
  setCityRelicObstacles(null);
  expect(insidePropFootprint(100 * RES, half, 0)).toBe(false);
});

test("horizontal, vertical and diagonal trips stop outside the head; live activation permits escape", () => {
  setCityRelicObstacles(cityRelicFootprints());
  const parts = cityRelicFootprints();
  const head = { x1: parts.at(-1)!.x1, maxDepth: Math.max(...parts.map(part => part.maxDepth)) };
  const right = head.x1 + half + 100;
  const front = head.maxDepth + 100, middle = head.x1 / 2;
  for (const [x, d, tx, td] of [
    [right, 0, middle, 0], [middle, front, middle, 0],
    [right, front, middle, 0], [middle, front, right, 0],
  ]) {
    const stop = clampLandmarkPath(x, d, tx, td, half, gap);
    expect(insidePropFootprint(stop.x, half, stop.depth)).toBe(false);
    // Every point on the clipped segment remains clear, not just its target.
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      expect(insidePropFootprint(x + (stop.x - x) * t, half, d + (stop.depth - d) * t)).toBe(false);
    }
  }
  expect(clampLandmarkPath(right, front, middle, front, half, gap)).toEqual({ x: middle, depth: front });
  expect(clampLandmarkPath(middle, 0, right, 0, half, gap)).toEqual({ x: right, depth: 0 });
  setCityRelicObstacles(null);
  expect(clampLandmarkPath(right, 0, middle, 0, half, gap)).toEqual({ x: middle, depth: 0 });
});

test("crabs and hands can cross the clear sand beneath the chin in both directions", () => {
  setCityRelicObstacles(cityRelicFootprints());
  const y = 335 * RES;
  const left = 175 * RES, right = 230 * RES;
  const leftDepth = y - sandTopAt(left), rightDepth = y - sandTopAt(right);
  for (const [fromX, fromDepth, toX, toDepth] of [
    [left, leftDepth, right, rightDepth], [right, rightDepth, left, leftDepth],
  ]) {
    expect(clampPathX(fromX, toX, half, gap, fromDepth, toDepth)).toBe(toX);
    expect(clampLandmarkPath(fromX, fromDepth, toX, toDepth, half, gap)).toEqual({x: toX, depth: toDepth});
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, x = fromX + (toX - fromX) * t, depth = fromDepth + (toDepth - fromDepth) * t;
      expect(depth).toBeLessThanOrEqual(maxSubstrateDepthAt(x));
      expect(insidePropFootprint(x, half, depth)).toBe(false);
    }
  }
});

for (const creature of ["crab", "hand"]) {
  test(`${creature} avoids the head and keeps moving for a simulated day`, async () => {
    const output = `test-results/${creature}-city-soak.json`;
    const child = Bun.spawn([Bun.which("bun")!, "tools/crab-soak.ts", "--days=1", "--fps=30", "--seed=24",
      "--city", `--creature=${creature}`, "--assert-moving", `--output=${output}`], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code, stdout + stderr).toBe(0);
    const report = await Bun.file(output).json();
    expect(report.episodes).toEqual([]);
    expect(report.obstacleChanges).toBeGreaterThan(700);
    expect(report.final.every((actor: {sampledDistance: number}) => actor.sampledDistance > 1000)).toBe(true);
  }, 60_000);
}
