import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/** A fresh user per test, so tests never see each other's data. */
export function newUser(): TestUser {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { name: "E2E Tester", email: `e2e-${id}@example.com`, password: "e2e-password-123" };
}

/** Signs up through the API; the page's browser context keeps the session cookies. */
export async function signUp(page: Page, user = newUser()): Promise<TestUser> {
  const res = await page.request.post("/api/auth/signup", {
    data: { email: user.email, name: user.name, password: user.password, locale: "en" },
  });
  expect(res.status(), await res.text()).toBe(201);
  return user;
}

/** Creates a task through the API (using the page's session) and returns it. */
export async function createTask(request: APIRequestContext, task: Record<string, unknown>) {
  const res = await request.post("/api/tasks", { data: task });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: number; title: string; dueAt: string | null; status: string };
}

export async function getTask(request: APIRequestContext, id: number) {
  const res = await request.get(`/api/tasks/${id}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data as { id: number; status: string; dueAt: string | null };
}

/** Drag with real mouse moves (dnd-kit needs movement past its activation distance). */
export async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}

export function center(box: { x: number; y: number; width: number; height: number } | null) {
  if (!box) throw new Error("Element has no bounding box (not visible?)");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Waits for the newest email to `address` in Mailpit and returns its text body. */
export async function latestEmailTo(request: APIRequestContext, address: string): Promise<{ subject: string; text: string }> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=1`);
        const body = (await res.json()) as { messages: MailpitMessage[] };
        found = body.messages[0];
        return Boolean(found);
      },
      { timeout: 15_000, message: `no email to ${address} in Mailpit` },
    )
    .toBe(true);
  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
  const message = (await res.json()) as { Subject: string; Text: string };
  return { subject: message.Subject, text: message.Text };
}

/** Whether the server has VAPID keys (otherwise the UI explains push is off). */
export async function pushConfigured(page: Page): Promise<boolean> {
  const config = await (await page.request.get("/api/reminders/push/config")).json();
  return Boolean(config.data.publicKey);
}
