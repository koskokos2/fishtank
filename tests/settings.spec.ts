import { decodeSettings, encodeSettings, defaultSettings, SETTING_GATES, type TankSettings } from "../src/settingsCodec";
import { test, expect, type Page } from "@playwright/test";
import { FISH_KINDS, FISH_SETS, fishKindSet } from "../src/fish";

function sharedSettings(page: Page): TankSettings {
  const params = new URL(page.url()).searchParams;
  expect([...params.keys()]).toEqual(["settings"]);
  expect(params.get("settings")).toMatch(/^[A-Za-z0-9_-]+$/);
  expect([28, 39, 50]).toContain(params.get("settings")!.length);
  const decoded = decodeSettings(params.get("settings")!);
  expect(decoded).not.toBeNull();
  return decoded!;
}
const skinField = (query: string) => ({ "goth-plants": "gothPlants", "goth-kelp": "gothKelp", "crawling-hands": "crawlingHands" } as const)[query as "goth-plants" | "goth-kelp" | "crawling-hands"];
const layer = (page: Page, name: string) => page.evaluate(name => window.birthdayTest.settingsLayer(name), name);
const checkbox = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true });
async function open(page: Page, query = "") {
  await page.goto(`/fixture?debug&sun=0&fish=3&${query}`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  sharedSettings(page);
}

test("theme presets switch live, sync controls, and round trip in shared settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, "plants=9&texture-filter=pixelated");
  await checkbox(page, "pause").check();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const before = sharedSettings(page);
  const theme = page.getByRole("combobox", { name: "theme", exact: true });
  await expect(theme).toHaveValue("none");
  await theme.selectOption("halloween");
  const halloween = sharedSettings(page);
  expect(halloween).toMatchObject({ gothPlants: true, gothKelp: true, crawlingHands: true,
    halloweenBubbles: true, counts: before.counts, smoothTextures: false, paused: true,
    realTimeSun: before.realTimeSun, sunTime: before.sunTime, resolution: before.resolution, frameCap: before.frameCap });
  expect(SETTING_GATES.filter(gate => (gate.startsWith("fish-") || gate.startsWith("obj-")) && !halloween.disabled.includes(gate)))
    .toEqual(["fish-halloween", "fish-witches", "obj-halloween"]);
  for (const label of ["goth plants", "goth kelp", "crawling hands", "halloween bubbles"]) {
    await expect(checkbox(page, label)).toBeChecked();
  }
  await expect.poll(async () => (await layer(page, "crabs")).every(o => o.sprite === "crawling-hand")).toBe(true);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.goto(page.url());
  await page.locator('canvas[data-ready="true"]').waitFor();
  await expect(theme).toHaveValue("halloween");
  expect(sharedSettings(page)).toEqual(halloween);
  // Customizing one field must not reset the remaining preset selections.
  await checkbox(page, "crawling hands").uncheck();
  await expect(theme).toHaveValue("none");
  expect(sharedSettings(page).gothPlants).toBe(true);
  await theme.selectOption("halloween");
  await theme.selectOption("none");
  for (const label of ["goth plants", "goth kelp", "crawling hands", "halloween bubbles"]) {
    await expect(checkbox(page, label)).not.toBeChecked();
  }
  expect(sharedSettings(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("Halloween bubbles switch live, burst within bounded pools, and restore from a shared URL", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, "off=backdrop");
  const origin = await page.evaluate(() => performance.timeOrigin);
  const fish = await layer(page, "fish");
  const sparks = () => page.evaluate(() => window.birthdayTest.halloweenSparks());
  await checkbox(page, "halloween bubbles").check();
  expect(sharedSettings(page).halloweenBubbles).toBe(true);
  expect(await layer(page, "motes")).toHaveLength(0);
  expect(sharedSettings(page).disabled).not.toContain("motes");
  expect(await sparks()).toHaveLength(1);
  await expect.poll(async () => (await sparks())[0]?.bursts, { timeout: 12000 }).toBeGreaterThan(0);
  const stats = (await sparks())[0];
  expect(stats.lights).toBeGreaterThan(0);
  expect(stats.lights).toBeLessThanOrEqual(stats.maxLights);
  expect(stats.embers).toBeLessThanOrEqual(stats.maxEmbers);
  const shared = page.url();
  for (let i = 0; i < 3; i++) {
    await checkbox(page, "halloween bubbles").uncheck();
    expect(await sparks()).toHaveLength(0);
    expect((await layer(page, "motes")).length).toBeGreaterThan(0);
    await checkbox(page, "halloween bubbles").check();
    expect(await sparks()).toHaveLength(1);
    expect(await layer(page, "motes")).toHaveLength(0);
  }
  await checkbox(page, "bubbles").uncheck();
  expect(await sparks()).toHaveLength(0);
  expect(await layer(page, "bubbles")).toHaveLength(0);
  await checkbox(page, "halloween bubbles").uncheck();
  await checkbox(page, "halloween bubbles").check();
  expect(await sparks()).toHaveLength(0);
  await checkbox(page, "bubbles").check();
  expect(await sparks()).toHaveLength(1);
  // Swimming changes depth order; identity and population must stay intact.
  expect(await layer(page, "fish")).toHaveLength(fish.length);
  expect(await layer(page, "fish")).toEqual(expect.arrayContaining(fish));
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.goto(shared);
  await page.locator('canvas[data-ready="true"]').waitFor();
  await expect(checkbox(page, "halloween bubbles")).toBeChecked();
  expect(await sparks()).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("Halloween sparks follow night and ray visibility without reloading", async ({ page }) => {
  await page.clock.setFixedTime("2026-10-16T12:00:00+01:00");
  await page.goto("/fixture?debug&sun=1&halloween-bubbles=1&fish=0");
  await page.locator('canvas[data-ready="true"]').waitFor();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const state = () => page.evaluate(() => window.birthdayTest.halloweenSparks()[0]);
  expect(await state()).toBeUndefined();
  expect((await layer(page, "motes")).length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.birthdayTest.regularBubblePools()), { timeout: 15000 }).toBeGreaterThan(0);
  // No settings interaction: an actual wall-clock transition must wake it.
  await page.clock.setFixedTime("2026-10-16T18:00:00+01:00");
  await expect.poll(async () => (await state())?.active ?? false).toBe(true);
  expect((await state()).lights).toBeGreaterThan(0);
  expect(await layer(page, "motes")).toHaveLength(0);
  expect(await page.evaluate(() => window.birthdayTest.regularBubblePools())).toBe(0);
  // Return to daytime by wall clock alone, with the saved theme still selected.
  await page.clock.setFixedTime("2026-10-17T12:00:00+01:00");
  await expect.poll(async () => (await layer(page, "motes")).length).toBeGreaterThan(0);
  expect(await state()).toBeUndefined();
  expect(sharedSettings(page).halloweenBubbles).toBe(true);
  const preview = page.getByRole("slider", { name: "temporary sun time" });
  await preview.fill("240");
  await expect.poll(async () => (await state())?.active ?? false).toBe(false);
  expect(await state()).toBeUndefined();
  expect((await layer(page, "motes")).length).toBeGreaterThan(0);
  await preview.fill("720");
  await checkbox(page, "sun").uncheck();
  await expect.poll(async () => (await state())?.active ?? false).toBe(true);
  await checkbox(page, "sun").check();
  await expect.poll(async () => (await state())?.active ?? false).toBe(false);
  await checkbox(page, "real-time sun").check();
  await preview.fill("1080");
  await expect.poll(async () => (await state())?.active ?? false).toBe(true);
  await checkbox(page, "bubbles").uncheck();
  expect(await page.evaluate(() => window.birthdayTest.halloweenSparks())).toHaveLength(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("layers toggle live, re-enable from URL-off, and leave other populations intact", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, "off=bubbles");
  const origin = await page.evaluate(() => performance.timeOrigin);
  const fish = await layer(page, "fish");
  const backdrop = await layer(page, "backdrop");
  await checkbox(page, "pause").check();
  await checkbox(page, "sun").uncheck();
  expect((await layer(page, "backdrop"))[0].hidden).toBe(true);
  await checkbox(page, "sun").check();
  expect((await layer(page, "backdrop"))[0].hidden).toBe(false);
  await expect(checkbox(page, "motes")).toHaveCount(0);
  expect(await layer(page, "motes")).toHaveLength(0);
  await checkbox(page, "bubbles").check();
  expect((await layer(page, "motes")).length).toBeGreaterThan(0);
  for (const name of ["plants", "bubbles", "kelp"]) {
    const count = (await layer(page, name)).length;
    expect(count, name).toBeGreaterThan(0);
    for (let i = 0; i < 2; i++) {
      await checkbox(page, name).uncheck();
      expect(await layer(page, name)).toHaveLength(0);
      expect(sharedSettings(page).disabled).toContain(name);
      if (name === "bubbles") {
        expect(await layer(page, "motes")).toHaveLength(0);
        expect(sharedSettings(page).disabled).toContain("motes");
      }
      await checkbox(page, name).check();
      expect((await layer(page, name)).length, name).toBe(count);
      if (name === "bubbles") {
        expect((await layer(page, "motes")).length).toBeGreaterThan(0);
        expect(sharedSettings(page).disabled).not.toContain("motes");
      }
    }
  }
  await checkbox(page, "sun").uncheck();
  await checkbox(page, "sun").check();
  expect(await layer(page, "fish")).toEqual(fish);
  expect(await layer(page, "backdrop")).toEqual(backdrop);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  expect(errors).toEqual([]);
});

test("populations, sets and birthday fish update without reloading", async ({ page }) => {
  await page.clock.setFixedTime("2026-10-25T12:00:00Z");
  await open(page);
  await checkbox(page, "pause").check();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const kelp = await layer(page, "kelp");
  const count = page.getByRole("spinbutton", { name: "fish", exact: true });
  await count.fill("7");
  await count.press("Tab");
  expect(await layer(page, "fish")).toHaveLength(7);
  expect(sharedSettings(page).counts.fish).toBe(7);
  await page.getByTitle("toggle all fish sets").click();
  expect(await layer(page, "fish")).toHaveLength(0);
  await checkbox(page, "main ⓘ").check();
  expect(await layer(page, "fish")).toHaveLength(7);
  await page.getByTitle("toggle all object sets").click();
  expect(await layer(page, "props")).toHaveLength(0);
  await checkbox(page, "small ⓘ").check();
  expect((await layer(page, "props")).filter(o => o.sprite).every(o => o.sprite === "small-props")).toBe(true);
  expect((await layer(page, "props")).length).toBeGreaterThan(0);
  await checkbox(page, "birthday fish (scheduled)").check();
  expect(await page.evaluate(() => window.birthdayTest.state().fish)).toHaveLength(3);
  await checkbox(page, "birthday fish (scheduled)").uncheck();
  expect(await page.evaluate(() => window.birthdayTest.state().fish)).toHaveLength(0);
  expect(await layer(page, "kelp")).toEqual(kelp);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("copied URLs restore live choices including manual night, sun preview and pause", async ({ page, browser }) => {
  await open(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await checkbox(page, "sun").uncheck();
  await page.getByRole("spinbutton", { name: "fish", exact: true }).fill("0");
  await page.getByRole("spinbutton", { name: "fish", exact: true }).press("Tab");
  await checkbox(page, "pause").check();
  const shared = await browser.newPage();
  await shared.addInitScript(() => localStorage.setItem("realTimeSun", "true"));
  await shared.goto(page.url());
  await shared.locator('canvas[data-ready="true"]').waitFor();
  await expect(checkbox(shared, "sun")).not.toBeChecked();
  await expect(checkbox(shared, "real-time sun")).not.toBeChecked();
  expect(await layer(shared, "fish")).toHaveLength(0);
  expect(await shared.evaluate(() => window.birthdayTest.paused())).toBe(true);
  await checkbox(page, "real-time sun").check();
  await page.getByRole("slider", { name: "temporary sun time" }).fill("480");
  expect(sharedSettings(page).sunTime).toBe(480);
  await shared.goto(page.url());
  await shared.locator('canvas[data-ready="true"]').waitFor();
  await expect(checkbox(shared, "real-time sun")).toBeChecked();
  await expect(shared.getByRole("slider", { name: "temporary sun time" })).toHaveValue("480");
  await page.getByRole("button", { name: "use real time" }).click();
  expect(sharedSettings(page).sunTime !== null).toBe(false);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await shared.close();
});

test("the off=all shortcut can be selectively re-enabled without reloading", async ({ page }) => {
  await open(page, "off=all");
  const origin = await page.evaluate(() => performance.timeOrigin);
  await checkbox(page, "sun").check();
  expect((await layer(page, "backdrop"))[0].hidden).toBe(false);
  expect(await layer(page, "fish")).toHaveLength(0);
  for (const name of ["sand", "props", "(all)", "caustics", "fish", "crabs", "cephs", "puffs"]) {
    await expect(checkbox(page, name)).toHaveCount(0);
  }
  await checkbox(page, "kelp").check();
  expect((await layer(page, "kelp")).length).toBeGreaterThan(0);
  await checkbox(page, "kelp").uncheck();
  expect(await layer(page, "kelp")).toHaveLength(0);
  // Updating visible controls must not silently enable hidden legacy gates.
  for (const gate of ["sand", "props", "caustics", "fish", "crabs", "cephs", "puffs"]) {
    expect(sharedSettings(page).disabled).toContain(gate);
  }
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

const skinSwitches = [
  { label: "goth plants", query: "goth-plants", group: "plants", normal: "plant-atlas-v2", alternate: "plant-atlas-v2-goth" },
  { label: "goth kelp", query: "goth-kelp", group: "kelp", normal: "luminous-kelp", alternate: "luminous-kelp-goth" },
  { label: "crawling hands", query: "crawling-hands", group: "crabs", normal: "hermit-crab", alternate: "crawling-hand" },
];

for (const startAlternate of [false, true]) {
  test(`skins switch live both ways and reuse cached atlases (start alternate: ${startAlternate})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await open(page, startAlternate ? "goth-plants=1&goth-kelp=1&crawling-hands=1" : "");
    await checkbox(page, "pause").check();
    const origin = await page.evaluate(() => performance.timeOrigin);
    const unchanged = await Promise.all(["fish", "snail", "props", "octo"].map(name => layer(page, name)));
    for (const skin of skinSwitches) {
      const before = await layer(page, skin.group);
      await checkbox(page, skin.label).setChecked(!startAlternate);
      await expect.poll(async () => (await layer(page, skin.group))[0]?.id).not.toBe(before[0].id);
      expect(sharedSettings(page)[skinField(skin.query)]).toBe(!startAlternate);
    }
    const drawing = await page.evaluate(() => window.birthdayTest.plantDrawing());
    expect(drawing.kelpHeight).toBeGreaterThan(0.25);
    expect(drawing.skins).toEqual(
      (startAlternate ? ["plant-atlas-v2", "luminous-kelp"] : ["plant-atlas-v2-goth", "luminous-kelp-goth"]).sort(),
    );
    expect((await layer(page, "crabs")).every(o => o.sprite === (startAlternate ? "hermit-crab" : "crawling-hand"))).toBe(true);
    await page.screenshot({ path: test.info().outputPath("live-skins.png") });
    const cached = await page.evaluate(() => window.birthdayTest.skinAssets());
    expect(Object.values(cached).every(Boolean)).toBe(true);
    for (let i = 0; i < 3; i++) {
      for (const skin of skinSwitches) {
        await checkbox(page, skin.label).setChecked(startAlternate);
        await checkbox(page, skin.label).setChecked(!startAlternate);
      }
    }
    expect(await page.evaluate(() => window.birthdayTest.skinAssets())).toEqual(cached);
    expect(await Promise.all(["fish", "snail", "props", "octo"].map(name => layer(page, name)))).toEqual(unchanged);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    expect(errors).toEqual([]);
  });
}

test("hidden skin changes load when enabled; rapid changes keep the latest selection", async ({ page }) => {
  await open(page, "off=plants,kelp&crabs=0");
  await checkbox(page, "pause").check();
  const origin = await page.evaluate(() => performance.timeOrigin);
  for (const skin of skinSwitches) {
    await checkbox(page, skin.label).check();
    expect(await layer(page, skin.group)).toHaveLength(0);
    expect((await page.evaluate(() => window.birthdayTest.skinAssets()))[skin.alternate]).toBeNull();
    // Start decoding an alternate atlas, then change our mind in the same task.
    await page.evaluate(({ group, label }) => {
      const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      const find = (text: string) => inputs.find(input => input.parentElement?.textContent?.trim() === text)!;
      if (group === "crabs") {
        const count = document.querySelector<HTMLInputElement>("#count-crabs")!;
        count.value = "5";
        count.dispatchEvent(new Event("change", { bubbles: true }));
      } else find(group).click();
      find(label).click();
    }, skin);
    await expect.poll(async () => (await page.evaluate(() => window.birthdayTest.skinAssets()))[skin.alternate]).toBeTruthy();
    expect(sharedSettings(page)[skinField(skin.query)]).toBe(false);
    expect((await layer(page, skin.group)).length).toBeGreaterThan(0);
  }
  expect((await page.evaluate(() => window.birthdayTest.plantDrawing())).skins).toEqual(["luminous-kelp", "plant-atlas-v2"]);
  expect((await layer(page, "crabs")).every(o => o.sprite === "hermit-crab")).toBe(true);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("witch fish set has twelve previews and switches live with shareable settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const excluded = FISH_SETS.filter(name => name !== "witches").map(name => `fish-${name}`).join(",");
  await open(page, `off=${excluded}`);
  await checkbox(page, "pause").check();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const kelp = await layer(page, "kelp");
  const witchSprites = new Set(FISH_KINDS.flatMap((kind, i) => fishKindSet(kind.name) === "witches" ? [`fish-${i}`] : []));
  expect(witchSprites.size).toBe(12);
  const fish = await layer(page, "fish");
  expect(fish).toHaveLength(3);
  expect(fish.every(object => witchSprites.has(object.sprite!))).toBe(true);
  await checkbox(page, "witches ⓘ").uncheck();
  expect(await layer(page, "fish")).toHaveLength(0);
  expect(sharedSettings(page).disabled).toContain("fish-witches");
  await checkbox(page, "witches ⓘ").check();
  expect(await layer(page, "fish")).toHaveLength(3);
  expect(await layer(page, "kelp")).toEqual(kelp);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.getByTitle("preview witches").click();
  for (const kind of FISH_KINDS.filter(kind => fishKindSet(kind.name) === "witches")) {
    await expect(page.getByText(kind.name, { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});


test("texture filtering switches the existing fish live and persists in shared URLs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  const filtering = checkbox(page, "texture filtering");
  await expect(filtering).toBeChecked();
  await checkbox(page, "pause").check();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const before = await page.evaluate(() => window.birthdayTest.fishFiltering());
  expect(before.fish).toHaveLength(3);
  expect(before.draws.length).toBeGreaterThan(0);
  for (const draw of before.draws) {
    expect(draw.leftPadding).toBeCloseTo(2);
    expect(draw.rightPadding).toBeCloseTo(2);
    expect(draw.topPadding).toBeCloseTo(2);
    expect(draw.bottomPadding).toBeCloseTo(2);
  }
  await filtering.uncheck();
  expect(sharedSettings(page).smoothTextures).toBe(false);
  const pixelated = await page.evaluate(() => window.birthdayTest.fishFiltering());
  expect(pixelated.draws).toHaveLength(0);
  expect(pixelated.fish).toEqual(before.fish);
  await filtering.check();
  const smooth = await page.evaluate(() => window.birthdayTest.fishFiltering());
  expect(smooth.draws.length).toBeGreaterThan(0);
  expect(smooth.fish).toEqual(before.fish);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  expect(sharedSettings(page).smoothTextures).toBe(true);
  await page.reload();
  await page.locator('canvas[data-ready="true"]').waitFor();
  await expect(filtering).toBeChecked();
  await filtering.uncheck();
  await page.reload();
  await page.locator('canvas[data-ready="true"]').waitFor();
  await expect(filtering).not.toBeChecked();
  expect((await page.evaluate(() => window.birthdayTest.fishFiltering())).draws).toHaveLength(0);
  expect(errors).toEqual([]);
});

for (const goth of [false, true]) {
  test(`texture filtering preserves plant and kelp geometry and batching (goth: ${goth})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await open(page, goth ? "goth-plants=1&goth-kelp=1" : "");
    await checkbox(page, "pause").check();
    const origin = await page.evaluate(() => performance.timeOrigin);
    const controllers = await Promise.all(["plants", "kelp"].map(name => layer(page, name)));
    const assets = await page.evaluate(() => window.birthdayTest.skinAssets());
    const before = await page.evaluate(() => window.birthdayTest.plantDrawing());
    expect(before.skins).toEqual((goth ? ["plant-atlas-v2-goth", "luminous-kelp-goth"] : ["plant-atlas-v2", "luminous-kelp"]).sort());
    expect(before.filtered).toEqual(before.skins);
    expect(before.validBounds).toBe(true);
    expect(before.uniformCounts).toEqual([1, 1]);
    expect(before.poses.length).toBeGreaterThan(20);
    const filtering = checkbox(page, "texture filtering");
    await filtering.uncheck();
    const pixelated = await page.evaluate(() => window.birthdayTest.plantDrawing());
    expect(pixelated.filtered).toEqual([]);
    expect(pixelated.poses).toEqual(before.poses);
    await filtering.check();
    const smooth = await page.evaluate(() => window.birthdayTest.plantDrawing());
    expect(smooth.filtered).toEqual(before.skins);
    expect(smooth.poses).toEqual(before.poses);
    expect(smooth.uniformCounts).toEqual([1, 1]);
    expect(await Promise.all(["plants", "kelp"].map(name => layer(page, name)))).toEqual(controllers);
    expect(await page.evaluate(() => window.birthdayTest.skinAssets())).toEqual(assets);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    await page.screenshot({ path: `test-results/plant-filtering-${goth ? "goth" : "normal"}.png` });
    expect(errors).toEqual([]);
  });
}

test("smooth fish rotate continuously and pixelated fish retain stepped pitch", async ({ page }) => {
  await open(page);
  const filtering = checkbox(page, "texture filtering");
  const angles = () => page.evaluate(() => window.birthdayTest.fishAngles());
  const ids = (await angles()).map(f => f.id).sort();
  const hasContinuousPitch = async () => (await angles()).some(f => Math.abs(f.angle / 7 - Math.round(f.angle / 7)) > 0.001);
  await expect.poll(hasContinuousPitch).toBe(true);
  expect((await angles()).every(f => Math.abs(f.angle) <= 22)).toBe(true);
  await filtering.uncheck();
  await expect.poll(hasContinuousPitch).toBe(false);
  await filtering.check();
  await expect.poll(hasContinuousPitch).toBe(true);
  expect((await angles()).map(f => f.id).sort()).toEqual(ids);
});


test("legacy links normalize without navigation; encoded settings win and preserve the hash", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("realTimeSun", "false");
    sessionStorage.setItem("settingsLoads", String(Number(sessionStorage.getItem("settingsLoads") ?? 0) + 1));
  });
  await page.goto("/fixture?debug&sun=1&sun-time=08:00&fish=4&res=1&cap=32&light-time=0#goth");
  await page.locator('canvas[data-ready="true"]').waitFor();
  expect(sharedSettings(page)).toMatchObject({ debug: true, realTimeSun: true, sunTime: 480, counts: { fish: 4 }, resolution: 1, frameCap: 32, lightTime: 0 });
  expect(new URL(page.url()).hash).toBe("#goth");
  expect(await page.evaluate(() => sessionStorage.getItem("settingsLoads"))).toBe("1");
  const s = { ...defaultSettings(), debug: true, resolution: 1 as const, realTimeSun: true, paused: true };
  await page.goto(`/fixture?settings=${encodeSettings(s)}&fish=999&sun=0`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  expect(sharedSettings(page)).toEqual(s);
  await expect(checkbox(page, "real-time sun")).toBeChecked();
  expect(await page.evaluate(() => window.birthdayTest.paused())).toBe(true);
});

test("resolution and frame cap reload with the full encoded snapshot intact", async ({ page }) => {
  await open(page, "res=1&goth-plants=1&texture-filter=pixelated&pause&sun-time=12:30");
  let origin = await page.evaluate(() => performance.timeOrigin);
  const before = sharedSettings(page);
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "resolution", exact: true }).selectOption("2")]);
  await page.locator('canvas[data-ready="true"]').waitFor();
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
  expect(sharedSettings(page)).toEqual({ ...before, resolution: 2 });
  expect((await page.evaluate(() => window.birthdayTest.state())).width).toBe(1280);
  origin = await page.evaluate(() => performance.timeOrigin);
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "fps cap", exact: true }).selectOption("30")]);
  await page.locator('canvas[data-ready="true"]').waitFor();
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
  expect(sharedSettings(page)).toEqual({ ...before, resolution: 2, frameCap: 32 });
});

test("malformed encoded settings fall back safely and discard conflicting legacy fields", async ({ page }) => {
  await page.goto("/fixture?settings=nothex&fish=999&goth-plants=1");
  await page.locator('canvas[data-ready="true"]').waitFor();
  expect(sharedSettings(page)).toEqual(defaultSettings());
});


test("existing hex links normalize to Base64url without reload or lost settings", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("settingsLoads", String(Number(sessionStorage.getItem("settingsLoads") ?? 0) + 1));
  });
  const s = { ...defaultSettings(), debug: true, paused: true, resolution: 1 as const,
    gothPlants: true, gothKelp: true, smoothTextures: false, sunTime: 480,
    frameCap: 47, lightTime: 12.5 };
  const hex = Buffer.from(encodeSettings(s), "base64url").toString("hex").toUpperCase();
  await page.goto(`/fixture?settings=${hex}#shared`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  expect(sharedSettings(page)).toEqual(s);
  expect(new URL(page.url()).searchParams.get("settings")).toBe(encodeSettings(s));
  expect(new URL(page.url()).hash).toBe("#shared");
  expect(await page.evaluate(() => sessionStorage.getItem("settingsLoads"))).toBe("1");
  const origin = await page.evaluate(() => performance.timeOrigin);
  await checkbox(page, "texture filtering").check();
  expect(sharedSettings(page)).toEqual({ ...s, smoothTextures: true });
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});
