import { expect, test } from "@playwright/test";
import { latestEmailTo, newUser, pushConfigured, signUp } from "./helpers";

test("reset a forgotten password through the emailed link", async ({ browser, request }) => {
  // Create the account in one browser, then act as someone logged out in another.
  const setup = await browser.newContext();
  const user = await signUp(await setup.newPage(), newUser());
  await setup.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  // The page is loaded on demand: wait for it, or the email could go into the login form still on screen.
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText(`If an account exists for ${user.email}`);

  const email = await latestEmailTo(request, user.email);
  expect(email.subject).toBe("Reset your Task Manager password");
  const link = email.text.match(/https?:\/\/\S+\/reset-password\?token=[\w-]+/)?.[0];
  expect(link, email.text).toBeTruthy();

  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await page.getByLabel("New password", { exact: true }).fill("brand-new-password");
  await page.getByLabel("Confirm new password").fill("brand-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();

  await expect(page.getByText("Your password was changed. Log in with the new one.")).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("brand-new-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // The link only works once.
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await page.getByLabel("New password", { exact: true }).fill("another-password-1");
  await page.getByLabel("Confirm new password").fill("another-password-1");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toContainText("This reset link is invalid or has expired.");
  await context.close();
});

test("dark mode and Portuguese, remembered across reloads", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings");

  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  // The page background really is dark, not just the class being set. Colors come back as
  // oklch(), so paint the computed color on a canvas to read it as RGB.
  const [r, g, b] = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  expect((r + g + b) / 3, `body background rgb(${r}, ${g}, ${b})`).toBeLessThan(50);

  // The choice is saved to the profile; wait for that, or the reload could still read the old one.
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/auth/me") && r.request().method() === "PATCH");
  await page.getByRole("combobox", { name: "Language" }).first().selectOption("pt");
  await saved;
  await expect(page.getByRole("link", { name: "Hoje" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Definições" })).toBeVisible();
});

test("explains when the browser blocks notifications", async ({ page }) => {
  // The default headless shell denies notifications (see push.spec.ts for the allowed case).
  await signUp(page);
  test.skip(!(await pushConfigured(page)), "push isn't configured on this server");
  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Notifications" }).getByRole("alert")).toContainText(
    "Notifications are blocked for this site",
  );
});
