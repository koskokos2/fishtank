import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Before the destination-depth fix, seed 24 strands seven crabs and two snails
// within one simulated day. Exercise the actual controllers and rotating props,
// including the shared crab controller with its crawling-hand skin.
for (const creature of ["crab", "snail", "hand"]) {
  test(`${creature} keeps moving through a day of prop changes`, async () => {
    const output = resolve(import.meta.dir, `../test-results/${creature}-soak-regression.json`);
    const process = Bun.spawn([Bun.which("bun")!, resolve(import.meta.dir, "crab-soak.ts"),
      "--days=1", "--fps=30", "--seed=24", `--creature=${creature}`,
      "--assert-moving", `--output=${output}`], {stdout: "pipe", stderr: "pipe"});
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited, new Response(process.stdout).text(), new Response(process.stderr).text(),
    ]);
    expect(exitCode, stdout + stderr).toBe(0);
    const report = await Bun.file(output).json();
    expect(report.obstacleChanges).toBeGreaterThan(700);
    expect(report.invalidRetargets).toEqual([]);
    expect(report.episodes).toEqual([]);
    expect(report.final).toHaveLength(20);
    for (const actor of report.final) {
      expect(actor.targetDepth).toBeLessThanOrEqual(actor.maxDepthAtTarget);
      expect(actor.stationarySeconds).toBeLessThan(300);
      expect(actor.sampledDistance).toBeGreaterThan(1000);
    }
  }, 30_000);
}
