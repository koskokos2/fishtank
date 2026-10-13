// Capture and validate the real, bundled WebGL lighting. Chrome is used just as
// in the project's Playwright suite. Outputs are intentionally outside the art
// pipeline: no screenshots or lighting textures are loaded by the application.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { serveDist } from "../src/serveDist";
import { WATER_LIGHTING_TUNING } from "../src/waterLighting";

const output = resolve(Bun.argv[2] ?? "test-results/water-lighting");
mkdirSync(output, { recursive: true });
const server = serveDist(resolve("dist"), 0);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
  if (message.type() === "error") errors.push(message.text());
});
const hidden = "fish,cephs,crabs,kelp,plants,props,motes,bubbles,puffs";

async function capture(name: string, time: number, res = 3, gate = "") {
  const params = new URLSearchParams({ "light-time": String(time), res: String(res), off: hidden + gate });
  await page.goto(`http://localhost:${server.port}/?${params}`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  // onLoad runs before rendering. Wait for the first completed presentation.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const image = PNG.sync.read(await page.locator("canvas").screenshot({ path: `${output}/${name}.png` }));
  if (errors.length) throw new Error(errors.join("\n"));
  return image;
}

function difference(a: PNG, b: PNG, top = 0, bottom = 1) {
  let sum = 0;
  let count = 0;
  for (let y = Math.floor(a.height * top); y < Math.floor(a.height * bottom); y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(a.data[i + c] - b.data[i + c]);
        count++;
      }
    }
  }
  return sum / count;
}
// Permit nearby rays and faint overlap within natural groups. Reject a broad
// continuous BRIGHT band, rather than requiring a gap between every shaft.
function checkRayGroups(on: PNG, off: PNG) {
  for (const depth of [0.15, 0.28, 0.40]) {
    const y = Math.floor(on.height * depth);
    let run = 0;
    let longest = 0;
    let shafts = 0;
    for (let x = 0; x < on.width; x++) {
      let delta = 0;
      for (let row = y - 1; row <= y + 1; row++) {
        const i = (row * on.width + x) * 4;
        for (let c = 0; c < 3; c++) delta += on.data[i + c] - off.data[i + c];
      }
      if (delta / 9 > 8) {
        run++;
        longest = Math.max(longest, run);
      } else {
        if (run >= 4) shafts++;
        run = 0;
      }
    }
    if (run >= 4) shafts++;
    check(longest / on.width < 0.12, `Rays merged at depth ${depth}: ${longest}px wide`);
    check(shafts >= 3, `Too few bright ray peaks at depth ${depth}: ${shafts}`);
  }
}

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

try {
  const still = await capture("rays-t0", 0);
  const repeat = await capture("rays-t0-repeat", 0);
  check(difference(still, repeat) === 0, "Fixed-time preview must be deterministic");
  const moved = await capture("rays-t12", 12);
  const later = await capture("rays-t32", 32);
  check(difference(still, moved, 0, 0.3) > 0.3, "Rays must move");
  check(difference(still, moved, 0.7) === 0, "Animation must leave the floor unchanged");
  const period = WATER_LIGHTING_TUNING.animationLoopSeconds;
  const wrapped = await capture("rays-loop", period);
  check(difference(still, wrapped) === 0, "Loop must return to the identical frame");
  const beforeLoop = await capture("rays-before-loop", period - 1 / 60);
  const afterLoop = await capture("rays-after-loop", 1 / 60);
  check(difference(beforeLoop, afterLoop, 0, 0.3) < 0.35, "Animation must cross the loop without a flash");
  const longRun = await capture("rays-long-run", period * 2000 + 12);
  check(difference(moved, longRun) < 0.01, "Long-running clocks must retain the same ray phase");
  const off = await capture("rays-off", 0, 3, ",caustics");
  const legacyOff = await capture("rays-legacy-off", 0, 3, ",water-light");
  check(difference(off, legacyOff) === 0, "Legacy water-light gate must disable the same effect");
  check(difference(still, off, 0, 0.1) > 1, "Ray entrances must be visible");
  check(difference(still, off, 0.12, 0.35) > 0.5, "Rays must be visible below the surface");
  check(difference(still, off, 0.7) === 0, "Light must not reach the floor");
  check(difference(still, off, 0, 0.001) === 0, "Top edge must have no surface texture");
  for (const frame of [still, moved, later]) checkRayGroups(frame, off);
  for (const time of [90, 240, 510]) {
    checkRayGroups(await capture(`rays-t${time}`, time), off);
  }
  for (const res of [1, 2, 6]) {
    const enabled = await capture(`rays-res${res}`, 0, res);
    const disabled = await capture(`rays-res${res}-off`, 0, res, ",caustics");
    check(difference(enabled, disabled, 0, 0.1) > 1, `Ray entrances missing at RES=${res}`);
    check(difference(enabled, disabled, 0.12, 0.35) > 0.5, `Rays missing at RES=${res}`);
    check(difference(enabled, disabled, 0.7) === 0, `Light reaches floor at RES=${res}`);
  }
  // Verify the normal running clock as well as manually selected frames.
  await page.goto(`http://localhost:${server.port}/?off=${hidden}`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  const liveA = PNG.sync.read(await page.locator("canvas").screenshot());
  await page.waitForTimeout(1500);
  const liveB = PNG.sync.read(await page.locator("canvas").screenshot());
  check(difference(liveA, liveB, 0, 0.3) > 0.1, "Normal runtime lighting must animate");
  // Exercise the actual sidebar gate through its normal reload path.
  await page.goto(`http://localhost:${server.port}/?debug&light-time=0&off=${hidden}`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  await page.getByRole("checkbox", { name: "caustics", exact: true }).uncheck();
  await page.waitForURL(url => (url.searchParams.get("off") ?? "").split(",").includes("caustics"));
  await page.locator('canvas[data-ready="true"]').waitFor();
  await page.getByRole("checkbox", { name: "caustics", exact: true }).check();
  await page.waitForURL(url => !(url.searchParams.get("off") ?? "").split(",").includes("caustics"));
  await page.locator('canvas[data-ready="true"]').waitFor();
  check(errors.length === 0, errors.join("\n"));
  console.log(`Water lighting verified: deterministic frames, motion, grouped rays, loop, gates, sidebar, RES=1/2/3/6.\nPreviews: ${output}`);
} finally {
  await browser.close();
  server.stop(true);
}
