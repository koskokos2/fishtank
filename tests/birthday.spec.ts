import { decodeSettings } from "../src/settingsCodec";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { BIRTHDAY_START, shouldShowBirthdayFish, birthdayCheckDelay } from "../src/birthdayDate";
import { BIRTHDAY_LAYOUT, BIRTHDAY_FRAME_WIDTH as FW, BIRTHDAY_FRAME_HEIGHT as FH } from "../src/birthdayFishAtlas";

async function loaded(page: Page) {
  await page.waitForFunction(() => window.birthdayTest?.state().loaded);
}
async function count(page: Page, expected: number) {
  await expect.poll(() => page.evaluate(() => window.birthdayTest.state().fish.length)).toBe(expected);
}
async function scan(page: Page, index: number) {
  const state = await page.evaluate(() => window.birthdayTest.state());
  const fish = state.fish[index];
  const canvas = (await page.locator("canvas").first().boundingBox())!;
  const scale = canvas.width / state.width;
  const right = fish.frame % 8 >= 4;
  const qrX = right ? FW - fish.qr.x - fish.qr.size : fish.qr.x;
  const x = Math.round(canvas.x + (fish.x - fish.width / 2 + qrX * fish.scale) * scale);
  const y = Math.round(canvas.y + (fish.y - fish.height / 2 + fish.qr.y * fish.scale) * scale);
  const size = Math.round(fish.qr.size * fish.scale * scale);
  const png = PNG.sync.read(await page.screenshot({ clip: { x, y, width: size, height: size } }));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

test("scheduled start is inclusive and disabled always means hidden", () => {
  expect(BIRTHDAY_START).toBe(Date.parse("2026-10-24T07:00:00Z"));
  expect(shouldShowBirthdayFish(true, new Date(BIRTHDAY_START - 1))).toBe(false);
  expect(shouldShowBirthdayFish(true, new Date(BIRTHDAY_START))).toBe(true);
  for (const date of [new Date(BIRTHDAY_START), new Date("2026-10-24T12:00:00Z"), new Date("2030-01-01")]) {
    expect(shouldShowBirthdayFish(true, date)).toBe(true);
    expect(shouldShowBirthdayFish(false, date)).toBe(false);
  }
  expect(shouldShowBirthdayFish(true, new Date(NaN))).toBe(false);
  expect(birthdayCheckDelay(new Date(BIRTHDAY_START - 250))).toBe(250);
  expect(birthdayCheckDelay(new Date(BIRTHDAY_START - 60_000))).toBe(30_000);
  expect(birthdayCheckDelay(new Date(BIRTHDAY_START))).toBe(30_000);
  expect(birthdayCheckDelay(new Date(NaN))).toBe(30_000);
});

test("all 24 atlas frames decode with clear enamel quiet zones and clear gutters", () => {
  const atlas = PNG.sync.read(readFileSync("art/birthday-fish-atlas.png"));
  expect(atlas.width).toBeLessThanOrEqual(2048);
  expect(atlas.height).toBeLessThanOrEqual(2048);
  for (const [index, entry] of BIRTHDAY_LAYOUT.entries()) {
    for (let direction = 0; direction < 2; direction++) for (let pose = 0; pose < 4; pose++) {
      const frame = index * 8 + direction * 4 + pose;
      // Include the generated rim and fish: decoration must not confuse finder
      // detection even when the decoder sees the whole sprite, not a QR crop.
      const sprite = new PNG({ width: FW, height: FH });
      PNG.bitblt(atlas, sprite, frame % 4 * FW, Math.floor(frame / 4) * FH, FW, FH, 0, 0);
      expect(jsQR(new Uint8ClampedArray(sprite.data), FW, FH)?.data).toBe(`https://x.kns.li/bd${index + 1}`);
      const qr = new PNG({ width: entry.qr.size, height: entry.qr.size });
      const x = (frame % 4) * FW + (direction ? FW - entry.qr.x - entry.qr.size : entry.qr.x);
      const y = Math.floor(frame / 4) * FH + entry.qr.y;
      PNG.bitblt(atlas, qr, x, y, qr.width, qr.height, 0, 0);
      expect(jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data).toBe(`https://x.kns.li/bd${index + 1}`);
      for (let yy = 0; yy < qr.height; yy++) for (let xx = 0; xx < qr.width; xx++) {
        const quiet = 4 * entry.qr.modulePixels;
        if (xx >= quiet && xx < qr.width - quiet && yy >= quiet && yy < qr.height - quiet) continue;
        const enamel = [...entry.qr.enamel, 255];
        if (!qr.data.subarray((yy * qr.width + xx) * 4, (yy * qr.width + xx) * 4 + 4).every((v, channel) => v === enamel[channel])) {
          throw new Error(`Quiet zone damaged in frame ${frame}`);
        }
      }
      for (let yy = 0; yy < FH; yy++) for (let xx = 0; xx < FW; xx++) {
        if (xx >= 4 && xx < FW - 4 && yy >= 4 && yy < FH - 4) continue;
        if (atlas.data[((Math.floor(frame / 4) * FH + yy) * atlas.width + frame % 4 * FW + xx) * 4 + 3] !== 0) {
          throw new Error(`Nontransparent gutter in frame ${frame}`);
        }
      }
    }
  }
});

test("open tab starts at the scheduled instant and reinstallation stays idempotent", async ({ page }) => {
  await page.clock.install({ time: new Date(BIRTHDAY_START - 250) });
  await page.clock.pauseAt(new Date(BIRTHDAY_START - 250));
  await page.goto("/fixture?birthday=1");
  await loaded(page);
  await count(page, 0);
  await page.clock.runFor(249);
  await count(page, 0);
  await page.clock.runFor(1);
  await count(page, 3);
  await page.evaluate(() => { window.birthdayTest.reinstall(); window.birthdayTest.reinstall(); });
  await count(page, 3);
  await page.clock.setSystemTime(new Date("2026-10-24T23:59:59.999+01:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(1);
  await count(page, 3);
});

for (const zone of ["Europe/London", "America/Los_Angeles", "Asia/Tokyo"]) {
  test(`fixed London start and resume: ${zone}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: zone });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(BIRTHDAY_START - 60_000) });
    await page.goto("/fixture?birthday=1");
    await loaded(page);
    await count(page, 0);
    await page.clock.setSystemTime(new Date(BIRTHDAY_START));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await count(page, 3);
    await page.clock.setSystemTime(new Date(BIRTHDAY_START - 60_000));
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await count(page, 0);
    await context.close();
  });
}

test("reload, blocked storage and disabled normal fish preserve birthday residents", async ({ page }) => {
  await page.clock.install({ time: new Date("2027-10-24T12:00:00+01:00") });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
  });
  await page.goto("/fixture?birthday=1&off=fish&fish=0");
  await loaded(page);
  await count(page, 3);
  await page.reload();
  await loaded(page);
  await count(page, 3);
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await count(page, 3);
  await page.evaluate(() => {
    window.birthdayTest.removeOne();
    window.dispatchEvent(new Event("focus"));
  });
  await count(page, 3);
});

test("settings enable the schedule, persist, and disable it even on October 24", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-13T12:00:00+01:00") });
  await page.goto("/fixture?off=fish&cap=32");
  await loaded(page);
  await count(page, 0);
  await page.getByRole("button", { name: "⚙", exact: true }).click();
  const override = page.getByRole("checkbox", { name: "Birthday fish (scheduled)", exact: true });
  await override.check();
  expect(decodeSettings(new URL(page.url()).searchParams.get("settings")!)?.birthday).toBe(true);
  await loaded(page);
  await count(page, 0);
  expect(decodeSettings(new URL(page.url()).searchParams.get("settings")!)?.disabled).toEqual(["fish"]);
  expect(decodeSettings(new URL(page.url()).searchParams.get("settings")!)?.frameCap).toBe(32);
  await page.reload();
  await loaded(page);
  await expect(override).toBeChecked();
  await count(page, 0);
  await page.clock.setSystemTime(new Date(BIRTHDAY_START));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await count(page, 3);
  await page.reload();
  await loaded(page);
  await count(page, 3);
  await override.uncheck();
  expect(decodeSettings(new URL(page.url()).searchParams.get("settings")!)?.birthday).toBe(false);
  await loaded(page);
  await count(page, 0);
  await page.clock.setSystemTime(new Date("2026-10-24T12:00:00+01:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await count(page, 0);
  await override.check();
  expect(decodeSettings(new URL(page.url()).searchParams.get("settings")!)?.birthday).toBe(true);
  await loaded(page);
  await count(page, 3);
  await override.uncheck();
  expect(decodeSettings(new URL(page.url()).searchParams.get("settings")!)?.birthday).toBe(false);
  await loaded(page);
  await count(page, 0);
  await page.reload();
  await loaded(page);
  await count(page, 0);
});

for (const [width, resolution] of [[1440, 3], [1920, 3], [1440, 1], [1440, 2], [1440, 6]]) {
  test(`desktop ${width} res ${resolution}: canvas-only fish, both directions scan, natural occlusion`, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-10-24T12:00:00+01:00") });
    await page.setViewportSize({ width, height: width * 9 / 16 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Default-resolution shots include the full population. Other resolutions
    // isolate QR sampling from transient creature occlusion (tested below).
    const otherCreatures = resolution === 3 ? "" : "&off=fish,cephs,crabs";
    await page.goto(`/fixture?birthday=1&res=${resolution}${otherCreatures}`);
    await loaded(page);
    await count(page, 3);
    await expect(page.locator("#birthday-fish, .birthday-fish, svg")).toHaveCount(0);
    for (const direction of [0, 1]) {
      await page.evaluate(direction => window.birthdayTest.pose(direction), direction);
      await page.screenshot({ path: testInfo.outputPath(`birthday-${direction}.png`) });
      for (let index = 0; index < 3; index++) {
        await expect.poll(() => scan(page, index)).toBe(`https://x.kns.li/bd${index + 1}`);
      }
    }
    // A scene object with the next z must cover the QR: this proves the fish
    // participate in world sorting, instead of rendering above the aquarium.
    await page.evaluate(() => { window.birthdayTest.occluder(); });
    await expect.poll(() => scan(page, 0)).toBeUndefined();
    expect(errors).toEqual([]);
  });
}

test("residents swim, turn, share fish depth ordering and stay spread across the tank", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date("2026-10-24T12:00:00+01:00") });
  await page.goto("/fixture?birthday=1&fish=35");
  await loaded(page);
  await count(page, 3);
  const initial = await page.evaluate(() => window.birthdayTest.state());
  expect(initial.ordinaryFish.length).toBeGreaterThan(0);
  expect(initial.ordinaryFish.every(fish => fish.collisionSensor && fish.chaseTarget)).toBe(true);
  let moved = false;
  const directions = new Set<number>();
  for (let sample = 0; sample < 16; sample++) {
    await page.clock.runFor(5000);
    const state = await page.evaluate(() => window.birthdayTest.state());
    expect(state.fish.length).toBe(3);
    state.fish.forEach((fish, index) => {
      moved ||= Math.abs(fish.x - initial.fish[index].x) > 30;
      directions.add(Math.floor(fish.frame % 8 / 4));
      expect(fish.ordinaryFishTag).toBe(true);
      expect(fish.collisionSensor).toBe(false);
      expect(fish.chaseTarget).toBe(false);
      expect(fish.z).toBeCloseTo(fish.expectedZ, 0);
      expect(fish.angle).toBe(0);
      expect(fish.flip).toBe(false);
      expect(fish.x - fish.width / 2).toBeGreaterThanOrEqual(0);
      expect(fish.x + fish.width / 2).toBeLessThanOrEqual(state.width);
      expect(fish.x - fish.width / 2).toBeGreaterThanOrEqual(state.width * index / 3);
      expect(fish.x + fish.width / 2).toBeLessThanOrEqual(state.width * (index + 1) / 3);
      expect(fish.y - fish.height / 2).toBeGreaterThanOrEqual(0);
      expect(fish.y + fish.height / 2).toBeLessThanOrEqual(state.height);
    });
  }
  expect(moved).toBe(true);
  expect(directions.size).toBe(2);
});

test("birthday sparkles stay bounded, preserve QR scans and clean up with their fish", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date(BIRTHDAY_START - 60_000) });
  await page.goto("/fixture?birthday=1&off=fish,cephs,crabs");
  await loaded(page);
  expect((await page.evaluate(() => window.birthdayTest.state())).sparkles).toEqual([]);
  await page.clock.setSystemTime(new Date(BIRTHDAY_START));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await count(page, 3);
  await page.clock.runFor(2500);
  const state = await page.evaluate(() => window.birthdayTest.state());
  expect(state.sparkles).toHaveLength(3);
  for (const trail of state.sparkles) {
    expect(trail.count).toBeGreaterThan(0);
    expect(trail.count).toBeLessThanOrEqual(112);
    expect(trail.z).toBeLessThan(trail.ownerZ!);
  }
  await page.screenshot({ path: testInfo.outputPath("birthday-sparkles.png") });
  for (const direction of [0, 1]) {
    await page.evaluate(direction => window.birthdayTest.pose(direction), direction);
    for (let index = 0; index < 3; index++) expect(await scan(page, index)).toBe(`https://x.kns.li/bd${index + 1}`);
  }
  await page.evaluate(() => { window.birthdayTest.resume(); window.birthdayTest.reinstall(); });
  expect((await page.evaluate(() => window.birthdayTest.state())).sparkles).toHaveLength(3);
  await page.clock.setSystemTime(new Date(BIRTHDAY_START - 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await count(page, 0);
  expect((await page.evaluate(() => window.birthdayTest.state())).sparkles).toEqual([]);
});

test("puffs setting also disables birthday sparkles", async ({ page }) => {
  await page.clock.install({ time: new Date(BIRTHDAY_START) });
  await page.goto("/fixture?birthday=1&off=puffs");
  await loaded(page);
  await count(page, 3);
  await page.clock.runFor(500);
  expect((await page.evaluate(() => window.birthdayTest.state())).sparkles).toEqual([]);
});

test("clicking each canvas fish opens its own birthday link", async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-10-24T12:00:00+01:00") });
  await context.route("https://x.kns.li/**", route => route.fulfill({ body: "Birthday test" }));
  await page.goto("/fixture?birthday=1&off=fish");
  await loaded(page);
  await count(page, 3);
  await page.evaluate(() => window.birthdayTest.pose(0));
  // Resume engine updates so its canvas hit detection can run.
  await page.evaluate(() => window.birthdayTest.resume());
  for (let index = 0; index < 3; index++) {
    const state = await page.evaluate(() => window.birthdayTest.state());
    const canvas = (await page.locator("canvas").first().boundingBox())!;
    const fish = state.fish[index];
    const popup = page.waitForEvent("popup");
    await page.mouse.click(canvas.x + fish.x * canvas.width / state.width, canvas.y + fish.y * canvas.height / state.height);
    const opened = await popup;
    await expect(opened).toHaveURL(`https://x.kns.li/bd${index + 1}`);
    await opened.close();
    await page.bringToFront();
    await count(page, 3);
  }
});
