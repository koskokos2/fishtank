import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: "http://localhost:8423",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    timezoneId: "Europe/London",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "bun run build && bun tests/serve.ts",
    url: "http://localhost:8423",
    reuseExistingServer: false,
  },
});
