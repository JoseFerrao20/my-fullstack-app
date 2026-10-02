import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { server } from "@/test/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
// Tests assert English copy regardless of the machine locale; Portuguese has its own tests.
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
