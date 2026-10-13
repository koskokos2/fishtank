import { test, expect, type Page } from "@playwright/test";

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
