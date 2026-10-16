import { test, expect } from "@playwright/test";

test("first visit explains settings and highlights the gear until the hint expires", async ({ page }) => {
  await page.goto("/fixture?fish=0&plants=0&jelly=0&octo=0&naut=0&crabs=0&snail=0");
  const hint = page.getByTestId("settings-hint");
  const gear = page.getByRole("button", { name: "settings", exact: true });
  await expect(hint).toBeVisible();
  await expect(page.getByRole("status")).toContainText("top-right corner");
  await expect(gear).toBeVisible();
  await expect(gear).not.toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: "test-results/settings-first-visit.png" });
  const url = page.url();
  await expect(hint).toHaveCount(0, { timeout: 17_000 });
  await expect(gear).toHaveCSS("box-shadow", "none");
  await expect(gear).toBeVisible();
  expect(page.url()).toBe(url);
  await page.reload();
  await expect(gear).toBeVisible();
  await expect(hint).toHaveCount(0);
});

test("opening settings dismisses the hint and it stays dismissed after reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/fixture?fish=0&plants=0&jelly=0&octo=0&naut=0&crabs=0&snail=0");
  const hint = page.getByTestId("settings-hint");
  await expect(hint).toBeVisible();
  const bounds = (await hint.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await expect(hint).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "theme", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "theme", exact: true })).toBeVisible();
  await expect(hint).toHaveCount(0);
});
