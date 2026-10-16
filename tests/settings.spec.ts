import { test, expect, type Page } from "@playwright/test";
import { FISH_KINDS, FISH_SETS, fishKindSet } from "../src/fish";

const layer = (page: Page, name: string) => page.evaluate(name => window.birthdayTest.settingsLayer(name), name);
const checkbox = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true });
async function open(page: Page, query = "") {
  await page.goto(`/fixture?debug&sun=0&fish=3&${query}`);
  await page.locator('canvas[data-ready="true"]').waitFor();
}

test("layers toggle live, re-enable from URL-off, and leave other populations intact", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, "off=motes");
  const origin = await page.evaluate(() => performance.timeOrigin);
  const fish = await layer(page, "fish");
  const backdrop = await layer(page, "backdrop");
  await checkbox(page, "pause").check();
  await checkbox(page, "backdrop").uncheck();
  expect((await layer(page, "backdrop"))[0].hidden).toBe(true);
  await checkbox(page, "backdrop").check();
  expect((await layer(page, "backdrop"))[0].hidden).toBe(false);
  await checkbox(page, "motes").check();
  expect((await layer(page, "motes")).length).toBeGreaterThan(0);
  for (const name of ["sand", "props", "plants", "motes", "bubbles", "kelp"]) {
    const count = (await layer(page, name)).length;
    expect(count, name).toBeGreaterThan(0);
    for (let i = 0; i < 2; i++) {
      await checkbox(page, name).uncheck();
      expect(await layer(page, name)).toHaveLength(0);
      expect(new URL(page.url()).searchParams.get("off")?.split(",")).toContain(name);
      await checkbox(page, name).check();
      expect((await layer(page, name)).length, name).toBe(count);
    }
  }
  await checkbox(page, "caustics").uncheck();
  await checkbox(page, "caustics").check();
  expect(await layer(page, "fish")).toEqual(fish);
  expect(await layer(page, "backdrop")).toEqual(backdrop);
  for (const [toggle, groups] of [["fish", ["fish"]], ["cephs", ["jelly", "naut", "octo"]], ["crabs", ["crabs", "snail"]]] as const) {
    await checkbox(page, toggle).uncheck();
    for (const group of groups) expect(await layer(page, group)).toHaveLength(0);
    await checkbox(page, toggle).check();
    for (const group of groups) expect((await layer(page, group)).length).toBeGreaterThan(0);
  }
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
  expect(new URL(page.url()).searchParams.get("fish")).toBe("7");
  await page.getByTitle("Toggle all fish sets").click();
  expect(await layer(page, "fish")).toHaveLength(0);
  await checkbox(page, "main ⓘ").check();
  expect(await layer(page, "fish")).toHaveLength(7);
  await page.getByTitle("Toggle all object sets").click();
  expect(await layer(page, "props")).toHaveLength(0);
  await checkbox(page, "small ⓘ").check();
  expect((await layer(page, "props")).filter(o => o.sprite).every(o => o.sprite === "small-props")).toBe(true);
  expect((await layer(page, "props")).length).toBeGreaterThan(0);
  await checkbox(page, "Birthday fish (scheduled)").check();
  expect(await page.evaluate(() => window.birthdayTest.state().fish)).toHaveLength(3);
  for (let i = 0; i < 2; i++) {
    await checkbox(page, "puffs").uncheck();
    expect(await page.evaluate(() => window.birthdayTest.state().sparkles)).toHaveLength(0);
    await checkbox(page, "puffs").check();
    expect(await page.evaluate(() => window.birthdayTest.state().sparkles)).toHaveLength(3);
  }
  await checkbox(page, "Birthday fish (scheduled)").uncheck();
  expect(await page.evaluate(() => window.birthdayTest.state().fish)).toHaveLength(0);
  expect(await layer(page, "kelp")).toEqual(kelp);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
});

test("copied URLs restore live choices including manual night, sun preview and pause", async ({ page, browser }) => {
  await open(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  await checkbox(page, "backdrop").uncheck();
  await checkbox(page, "fish").uncheck();
  await checkbox(page, "pause").check();
  const shared = await browser.newPage();
  await shared.addInitScript(() => localStorage.setItem("realTimeSun", "true"));
  await shared.goto(page.url());
  await shared.locator('canvas[data-ready="true"]').waitFor();
  await expect(checkbox(shared, "backdrop")).not.toBeChecked();
  await expect(checkbox(shared, "real-time sun")).not.toBeChecked();
  expect(await layer(shared, "fish")).toHaveLength(0);
  expect(await shared.evaluate(() => window.birthdayTest.paused())).toBe(true);
  await checkbox(page, "real-time sun").check();
  await page.getByRole("slider", { name: "Temporary sun time" }).fill("480");
  expect(new URL(page.url()).searchParams.get("sun-time")).toBe("08:00");
  await shared.goto(page.url());
  await shared.locator('canvas[data-ready="true"]').waitFor();
  await expect(checkbox(shared, "real-time sun")).toBeChecked();
  await expect(shared.getByRole("slider", { name: "Temporary sun time" })).toHaveValue("480");
  await page.getByRole("button", { name: "Use real time" }).click();
  expect(new URL(page.url()).searchParams.has("sun-time")).toBe(false);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await shared.close();
});

test("the off=all shortcut can be selectively re-enabled without reloading", async ({ page }) => {
  await open(page, "off=all");
  const origin = await page.evaluate(() => performance.timeOrigin);
  await checkbox(page, "backdrop").check();
  expect((await layer(page, "backdrop"))[0].hidden).toBe(false);
  expect(await layer(page, "fish")).toHaveLength(0);
  await checkbox(page, "sand").check();
  expect(await layer(page, "sand")).toHaveLength(1);
  await checkbox(page, "(all)").check();
  expect((await layer(page, "kelp")).length).toBeGreaterThan(0);
  await checkbox(page, "(all)").uncheck();
  expect(await layer(page, "kelp")).toHaveLength(0);
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
      expect(new URL(page.url()).searchParams.get(skin.query)).toBe(startAlternate ? null : "1");
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
  await open(page, "off=plants,kelp,crabs");
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
      find(group).click();
      find(label).click();
    }, skin);
    await expect.poll(async () => (await page.evaluate(() => window.birthdayTest.skinAssets()))[skin.alternate]).toBeTruthy();
    expect(new URL(page.url()).searchParams.has(skin.query)).toBe(false);
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
  expect(new URL(page.url()).searchParams.get("off")?.split(",")).toContain("fish-witches");
  await checkbox(page, "witches ⓘ").check();
  expect(await layer(page, "fish")).toHaveLength(3);
  expect(await layer(page, "kelp")).toEqual(kelp);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.getByTitle("Preview witches").click();
  for (const kind of FISH_KINDS.filter(kind => fishKindSet(kind.name) === "witches")) {
    await expect(page.getByText(kind.name, { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});


test("texture filtering switches the existing fish live and persists in shared URLs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  const filtering = checkbox(page, "Texture filtering");
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
  expect(new URL(page.url()).searchParams.get("texture-filter")).toBe("pixelated");
  const pixelated = await page.evaluate(() => window.birthdayTest.fishFiltering());
  expect(pixelated.draws).toHaveLength(0);
  expect(pixelated.fish).toEqual(before.fish);
  await filtering.check();
  const smooth = await page.evaluate(() => window.birthdayTest.fishFiltering());
  expect(smooth.draws.length).toBeGreaterThan(0);
  expect(smooth.fish).toEqual(before.fish);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  expect(new URL(page.url()).searchParams.get("texture-filter")).toBe("smooth");
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
    const filtering = checkbox(page, "Texture filtering");
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
  const filtering = checkbox(page, "Texture filtering");
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
