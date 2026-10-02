import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the full Docker stack (`docker compose up -d --build`).
 * Every test signs up its own user, so tests run in parallel without sharing state.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost",
    locale: "en-US",
    timezoneId: "Europe/Lisbon",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
