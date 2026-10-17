import { test, expect } from "@playwright/test";
import { decodeSettings } from "../src/settingsCodec";

test("ruins persist through live day, night and theme changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("settingsHintSeen", "true"));
  await page.goto("/fixture?sun=1&sun-time=12:00&light-time=9&fish=12&plants=60");
  await page.locator('canvas[data-ready="true"]').waitFor();
  const ruins = () => page.evaluate(() => window.birthdayTest.settingsLayer("ruins"));
  const initial = await ruins();
  expect(initial).toHaveLength(3);
  expect(initial).toEqual(expect.arrayContaining([
    expect.objectContaining({ sprite: "backdrop-ruins", hidden: false }),
    expect.objectContaining({ sprite: "backdrop-middle-ruins", hidden: false }),
    expect.objectContaining({ sprite: "backdrop-distant-ruins", hidden: false }),
  ]));
  const appearance = () => page.evaluate(() => window.birthdayTest.ruinsAppearance());
  await expect.poll(async () => (await appearance())[0].tint).toEqual([255, 255, 255]);
  expect((await appearance()).map(object => object.opacity)).toEqual([.3, 1, 1]);
  expect((await appearance()).map(object => object.z)).toEqual([-192, -191, -190]);
  const water = () => page.evaluate(() => window.birthdayTest.waterAppearance());
  expect(await water()).toEqual([
    { shader: "water-light", z: -200, hidden: false },
    { shader: "sun-rays", z: -191.5, hidden: false },
  ]);
  await page.screenshot({ path: "test-results/ruins-day.png" });
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await expect(page.getByRole("slider", { name: /distant opacity|middle distance|foreground distance|haze|brightness/ })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "sunken city", exact: true }).check();
  await page.getByRole("checkbox", { name: "pause", exact: true }).check();
  await page.getByRole("slider", { name: "temporary sun time" }).fill("1320");
  expect((await page.evaluate(() => window.birthdayTest.settingsLayer("backdrop")))[0].hidden).toBe(true);
  expect((await water()).every(layer => layer.hidden)).toBe(true);
  expect(await ruins()).toEqual(initial);
  await expect.poll(async () => (await appearance())[0].tint[0]).toBeLessThan(70);
  await page.screenshot({ path: "test-results/ruins-night.png" });
  await page.getByRole("combobox", { name: "theme", exact: true }).selectOption("halloween");
  expect(await ruins()).toEqual(initial.map(layer => ({ ...layer, sprite: `${layer.sprite}-halloween` })));
  await page.getByRole("slider", { name: "temporary sun time" }).fill("720");
  expect((await page.evaluate(() => window.birthdayTest.settingsLayer("backdrop")))[0].hidden).toBe(false);
  expect((await water()).every(layer => !layer.hidden)).toBe(true);
  expect(await ruins()).toEqual(initial.map(layer => ({ ...layer, sprite: `${layer.sprite}-halloween` })));
  await expect.poll(async () => (await appearance())[0].tint).toEqual([255, 255, 255]);
  await page.getByRole("combobox", { name: "theme", exact: true }).selectOption("none");
  expect(await ruins()).toEqual(initial);
  expect(errors).toEqual([]);
});

test("sunken city toggles every ruin depth live and restores from its shared URL", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("settingsHintSeen", "true"));
  await page.goto("/fixture?debug&sun=0&light-time=9&pause");
  await page.locator('canvas[data-ready="true"]').waitFor();
  const toggle = page.getByRole("checkbox", { name: "sunken city", exact: true });
  const layers = (name: string) => page.evaluate(name => window.birthdayTest.settingsLayer(name), name);
  await expect(toggle).toBeChecked();
  const before = await layers("ruins");
  const slots = () => page.evaluate(() => window.birthdayTest.propSlots());
  expect(await slots()).toEqual([0, 3, 4, 5, 6, 7]);
  const relic = await layers("city-relic");
  expect(relic).toHaveLength(1);
  expect(relic[0]).toMatchObject({ sprite: "city-guardian", hidden: false });
  const headBlocked = () => page.evaluate(() => window.birthdayTest.crawlerBlocked(100, 20));
  expect(await headBlocked()).toBe(true);
  const sand = await layers("sand");
  const water = await layers("backdrop");
  const fish = await layers("fish");
  const origin = await page.evaluate(() => performance.timeOrigin);
  await toggle.uncheck();
  expect(await headBlocked()).toBe(false);
  expect(await slots()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(await layers("ruins")).toEqual(before.map(layer => ({ ...layer, hidden: true })));
  expect(await layers("city-relic")).toEqual(relic.map(layer => ({ ...layer, hidden: true })));
  expect(await layers("sand")).toEqual(sand);
  expect(await layers("backdrop")).toEqual(water);
  expect(await layers("fish")).toEqual(fish);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  const encoded = new URL(page.url()).searchParams.get("settings")!;
  expect(decodeSettings(encoded)?.disabled).toContain("ruins");
  await page.goto(page.url());
  await page.locator('canvas[data-ready="true"]').waitFor();
  await expect(toggle).not.toBeChecked();
  const restored = await layers("ruins");
  expect(restored).toHaveLength(3);
  expect(restored.every(layer => layer.hidden)).toBe(true);
  expect((await layers("city-relic"))[0].hidden).toBe(true);
  await toggle.check();
  expect(await headBlocked()).toBe(true);
  expect(await slots()).toEqual([0, 3, 4, 5, 6, 7]);
  expect(await layers("ruins")).toEqual(restored.map(layer => ({ ...layer, hidden: false })));
  expect((await layers("city-relic"))[0].hidden).toBe(false);
});

test("guardian stays at the chosen position without placement controls", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("settingsHintSeen", "true"));
  await page.goto("/fixture?pause&sun=0&light-time=9&fish=12&plants=40");
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const position = () => page.evaluate(() => window.birthdayTest.guardianPosition()[0]);
  const initial = await position();
  expect(initial.x).toBe((-3 - 2) * 3); // selected x minus transparent padding, RES=3
  await canvas.screenshot({ path: "test-results/guardian-fixed.png" });
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await expect(page.getByRole("slider", { name: /guardian/ })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "guardian position", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "theme", exact: true }).selectOption("halloween");
  expect(await position()).toEqual(initial);
  await page.goto(page.url());
  await canvas.waitFor();
  expect(await position()).toMatchObject({ x: initial.x, y: initial.y, z: initial.z });
});


test("Halloween replaces all four city assets live and restores its shared URL", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("settingsHintSeen", "true"));
  await page.goto("/fixture?pause&sun=1&sun-time=12:00&light-time=9&fish=12&plants=40");
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor();
  const layers = (name: string) => page.evaluate(name => window.birthdayTest.settingsLayer(name), name);
  const normalRuins = await layers("ruins"), normalHead = await layers("city-relic");
  const sand = await layers("sand"), water = await layers("backdrop");
  const position = await page.evaluate(() => window.birthdayTest.guardianPosition());
  const origin = await page.evaluate(() => performance.timeOrigin);
  const gear = page.getByRole("button", { name: "settings", exact: true });
  await gear.click();
  const theme = page.getByRole("combobox", { name: "theme", exact: true });
  const city = page.getByRole("checkbox", { name: "sunken city", exact: true });
  for (let i = 0; i < 3; i++) {
    await theme.selectOption("halloween");
    expect(await layers("ruins")).toEqual(normalRuins.map(layer => ({...layer, sprite: `${layer.sprite}-halloween`})));
    expect(await layers("city-relic")).toEqual(normalHead.map(layer => ({...layer, sprite: "city-guardian-halloween"})));
    expect(await layers("sand")).toEqual(sand);
    expect(await layers("backdrop")).toEqual(water);
    expect(await page.evaluate(() => window.birthdayTest.guardianPosition())).toEqual(position);
    if (i < 2) {
      await theme.selectOption("none");
      expect(await layers("ruins")).toEqual(normalRuins);
      expect(await layers("city-relic")).toEqual(normalHead);
    }
  }
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.getByRole("button", { name: "×", exact: true }).first().click();
  await canvas.screenshot({ path: "test-results/halloween-city-day.png" });
  await gear.click();
  await page.getByRole("slider", { name: "temporary sun time" }).fill("1320");
  await page.getByRole("button", { name: "×", exact: true }).first().click();
  await canvas.screenshot({ path: "test-results/halloween-city-night.png" });
  await gear.click();
  await city.uncheck();
  expect((await layers("ruins")).every(layer => layer.hidden)).toBe(true);
  expect((await layers("city-relic"))[0].hidden).toBe(true);
  await city.check();
  const url = page.url();
  await page.goto(url);
  await canvas.waitFor();
  await expect(theme).toHaveValue("halloween");
  expect((await layers("ruins")).every(layer => layer.sprite?.endsWith("-halloween") && !layer.hidden)).toBe(true);
  expect((await layers("city-relic"))[0]).toMatchObject({sprite: "city-guardian-halloween", hidden: false});
  expect(errors).toEqual([]);
});
