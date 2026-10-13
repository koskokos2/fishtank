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
