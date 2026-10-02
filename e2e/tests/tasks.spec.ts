import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

test("sign up, quick-add a task and complete it", async ({ page }) => {
  const user = newUser();

  await page.goto("/signup");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign up" }).click();

  // New accounts land on Today.
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

  const quickAdd = page.getByRole("textbox", { name: "Quick add a task" });
  await quickAdd.fill("Buy milk tomorrow at 9am !high @shop");
  await expect(page.getByTestId("chip-priority")).toHaveText(/High/);
  await expect(page.getByTestId("chip-tag-shop")).toHaveText("@shop");
  await quickAdd.press("Enter");
  await expect(page.getByText("Added “Buy milk”")).toBeVisible();

  // Tomorrow's task shows up under Upcoming, with what quick add understood.
  await page.getByRole("link", { name: "Upcoming" }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Buy milk" });
  await expect(item).toBeVisible();
  await expect(item.getByText("High")).toBeVisible();
  await expect(item.getByText("@shop")).toBeVisible();
  await expect(item.getByText(/9:00 AM/)).toBeVisible();

  // Complete it from the full list.
  await page.getByRole("link", { name: "All tasks" }).click();
  // The checkbox follows the server's answer (not optimistic), so click and wait for the new state.
  await page.getByRole("checkbox", { name: 'Mark "Buy milk" as done' }).click();
  await expect(page.getByRole("checkbox", { name: 'Mark "Buy milk" as not done' })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Buy milk" })).toHaveClass(/line-through/);
});

test("delete goes to the trash and Undo brings it back", async ({ page }) => {
  const user = newUser();
  await page.request.post("/api/auth/signup", { data: { email: user.email, name: user.name, password: user.password } });
  await page.request.post("/api/tasks", { data: { title: "Keep me" } });

  await page.goto("/tasks");
  await page.getByRole("button", { name: 'Delete "Keep me"' }).click();
  await expect(page.getByText("No tasks yet. Create your first one!")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: "Keep me" })).toBeVisible();
});
