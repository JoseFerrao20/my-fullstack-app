import { expect, test } from "@playwright/test";
import { center, createTask, dragTo, getTask, signUp } from "./helpers";

test("drag a card to another column on the board", async ({ page }) => {
  await signUp(page);
  const task = await createTask(page.request, { title: "Write report" });

  await page.goto("/board");
  const todo = page.getByRole("region", { name: "To do" });
  const inProgress = page.getByRole("region", { name: "In progress" });
  await expect(todo.getByText("Write report")).toBeVisible();

  const handle = page.getByRole("button", { name: 'Drag "Write report"' });
  await dragTo(page, center(await handle.boundingBox()), center(await inProgress.boundingBox()));

  await expect(inProgress.getByText("Write report")).toBeVisible();
  await expect(todo.getByText("Write report")).toHaveCount(0);
  await expect.poll(async () => (await getTask(page.request, task.id)).status).toBe("in_progress");
});

test("drag a task to another day in the calendar keeps its time", async ({ page }) => {
  await signUp(page);
  // A fixed future week (Mon 13 – Sun 19 May 2030) keeps the test independent of today's date.
  // 09:30 in Lisbon in May is 08:30 UTC.
  const task = await createTask(page.request, { title: "Dentist", dueAt: "2030-05-15T08:30:00Z" });

  await page.goto("/calendar?view=week&date=2030-05-15");
  const wednesday = page.getByRole("group", { name: /^Wednesday, May 15/ });
  const friday = page.getByRole("group", { name: /^Friday, May 17/ });
  const chip = wednesday.getByRole("button", { name: /Dentist/ });
  await expect(chip).toBeVisible();

  await dragTo(page, center(await chip.boundingBox()), center(await friday.boundingBox()));

  await expect(friday.getByRole("button", { name: /Dentist/ })).toBeVisible();
  await expect.poll(async () => (await getTask(page.request, task.id)).dueAt).toBe("2030-05-17T08:30:00Z");
});
