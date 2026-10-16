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
  await page.screenshot({ path: "test-results/ruins-day.png" });
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await expect(page.getByRole("slider", { name: /distant opacity|middle distance|foreground distance|haze|brightness/ })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "sunken city", exact: true }).check();
  await page.getByRole("checkbox", { name: "pause", exact: true }).check();
  await page.getByRole("slider", { name: "temporary sun time" }).fill("1320");
  expect((await page.evaluate(() => window.birthdayTest.settingsLayer("backdrop")))[0].hidden).toBe(true);
  expect(await ruins()).toEqual(initial);
  await expect.poll(async () => (await appearance())[0].tint[0]).toBeLessThan(70);
  await page.screenshot({ path: "test-results/ruins-night.png" });
  await page.getByRole("combobox", { name: "theme", exact: true }).selectOption("halloween");
  expect(await ruins()).toEqual(initial);
  await page.getByRole("slider", { name: "temporary sun time" }).fill("720");
  expect((await page.evaluate(() => window.birthdayTest.settingsLayer("backdrop")))[0].hidden).toBe(false);
  expect(await ruins()).toEqual(initial);
  await expect.poll(async () => (await appearance())[0].tint).toEqual([255, 255, 255]);
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
  const sand = await layers("sand");
  const water = await layers("backdrop");
  const fish = await layers("fish");
  const origin = await page.evaluate(() => performance.timeOrigin);
  await toggle.uncheck();
  expect(await layers("ruins")).toEqual(before.map(layer => ({ ...layer, hidden: true })));
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
  await toggle.check();
  expect(await layers("ruins")).toEqual(restored.map(layer => ({ ...layer, hidden: false })));
});
