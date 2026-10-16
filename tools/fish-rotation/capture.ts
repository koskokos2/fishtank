import { chromium } from "@playwright/test";
import { resolve } from "node:path";
const output = resolve(Bun.argv[2] ?? "experiments/fish-rotation");
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(Bun.file(`${output}/index.html`)) });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1760, height: 1160 }, deviceScaleFactor: 1,
    recordVideo: { dir: output, size: { width: 1760, height: 1160 } } });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.waitForFunction(() => window.rotationReady === true);
  await page.locator("#angle").fill("0");
  await page.waitForTimeout(120);
  const level = await page.evaluate(() => window.rotationProbe());
  await page.screenshot({ path: `${output}/level-validation.png`, fullPage: true });
  if (level.visiblePixels.some(count => count < 1000)) {
    throw new Error(`Invalid level-pose comparison: ${JSON.stringify(level)}`);
  }
  for (const [name, species, angle] of [
    ["witch-up", "mourning_veil_witch", "14"],
    ["witch-down", "mourning_veil_witch", "-14"],
    ["reaper-up", "grim_reaper_fish", "14"],
    ["tetra-up", "neon_tetra", "14"],
  ]) {
    await page.locator("#fish").selectOption(species);
    await page.locator("#angle").fill(angle);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  }
  await page.locator("#fish").selectOption("mourning_veil_witch");
  await page.locator("#play").click();
  await page.waitForTimeout(10000);
  await page.waitForTimeout(10000);
  if (errors.length) throw new Error(errors.join("\n"));
  const video = page.video()!;
  await page.close();
  await video.saveAs(`${output}/motion-comparison.webm`);
  await video.delete();
  console.log(`Captured four comparison images and ${output}/motion-comparison.webm`);
} finally {
  await browser.close();
  server.stop();
}
