import { expect, test } from "@playwright/test";
import { pushConfigured, signUp } from "./helpers";

// The default headless shell keeps notifications denied even when granted; full Chromium honours it.
test.use({ channel: "chromium", permissions: ["notifications"] });

test("offers to turn push on when the browser allows notifications", async ({ page }) => {
  await signUp(page);
  const configured = await pushConfigured(page);
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Notifications" });
  if (configured) {
    // Actually subscribing needs a real push service, which tests can't reach.
    await expect(section.getByRole("button", { name: "Turn on" })).toBeVisible();
  } else {
    await expect(section.getByText("Push notifications aren't set up on this server.")).toBeVisible();
  }
  await expect(section.getByLabel("Email me my reminders")).toBeChecked();
});
