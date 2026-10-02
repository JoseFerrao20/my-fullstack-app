import { screen, within } from "@testing-library/react";
import { NotificationsSection } from "@/features/account/NotificationsSection";
import { notificationText } from "@/features/notifications/text";
import i18n from "@/lib/i18n";
import { renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";

const PREFS = { emailReminders: true, pushReminders: true, dailyDigest: false, digestHour: 8, timezone: "UTC" };

function servePreferences(publicKey: string | null = null) {
  let saved: unknown;
  server.use(
    http.get(apiUrl("/reminders/preferences"), () => ok(PREFS)),
    http.get(apiUrl("/reminders/push/config"), () => ok({ publicKey })),
    http.patch(apiUrl("/reminders/preferences"), async ({ request }) => {
      saved = await request.json();
      return ok({ ...PREFS, ...(saved as object) });
    }),
  );
  return () => saved;
}

/** Minimal stand-ins for the browser's push APIs (jsdom has none). */
function fakeBrowserPush() {
  let current: { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null = null;
  const subscription = {
    endpoint: "https://push.example.com/abc",
    toJSON: () => ({ endpoint: "https://push.example.com/abc", keys: { p256dh: "pk", auth: "au" } }),
    unsubscribe: async () => {
      current = null;
      return true;
    },
  };
  const subscribeSpy = vi.fn(async () => {
    current = subscription;
    return subscription;
  });
  const reg = { pushManager: { getSubscription: async () => current, subscribe: subscribeSpy } };
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission: async () => "granted" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: async () => reg, getRegistration: async () => reg },
  });
  return { subscribeSpy };
}

describe("Notification settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error — remove the fake added by fakeBrowserPush
    delete navigator.serviceWorker;
  });

  it("saves email and digest preferences with the browser's time zone", async () => {
    const saved = servePreferences();
    const { user } = renderWithProviders(<NotificationsSection />, { path: "/settings" });

    await user.click(await screen.findByLabelText("Email me my reminders"));
    await user.click(screen.getByLabelText(/Daily summary email/));
    await user.selectOptions(screen.getByLabelText("Send at"), "7");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(saved()).toEqual({
      ...PREFS,
      emailReminders: false,
      dailyDigest: true,
      digestHour: 7,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it("explains when push isn't configured on the server", async () => {
    servePreferences(null);
    fakeBrowserPush();
    renderWithProviders(<NotificationsSection />, { path: "/settings" });
    expect(await screen.findByText("Push notifications aren't set up on this server.")).toBeInTheDocument();
  });

  it("explains when the browser can't do push", async () => {
    servePreferences("server-key");
    renderWithProviders(<NotificationsSection />, { path: "/settings" });
    expect(await screen.findByText(/This browser doesn't support push notifications/)).toBeInTheDocument();
  });

  it("turns push on and off for this device", async () => {
    servePreferences("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");
    const { subscribeSpy } = fakeBrowserPush();
    let subscribed: unknown;
    let unsubscribed: unknown;
    const testPush = vi.fn(() => ok(null, { delivered: 1 }));
    server.use(
      http.post(apiUrl("/reminders/push/subscriptions"), async ({ request }) => {
        subscribed = await request.json();
        return ok(null);
      }),
      http.delete(apiUrl("/reminders/push/subscriptions"), async ({ request }) => {
        unsubscribed = await request.json();
        return ok(null);
      }),
      http.post(apiUrl("/reminders/push/test"), testPush),
    );
    const { user } = renderWithProviders(<NotificationsSection />, { path: "/settings" });
    const section = await screen.findByRole("region", { name: "Notifications" });

    await user.click(await within(section).findByRole("button", { name: "Turn on" }));
    expect(await within(section).findByText("On for this device")).toBeInTheDocument();
    expect(subscribed).toEqual({ endpoint: "https://push.example.com/abc", keys: { p256dh: "pk", auth: "au" } });
    // The VAPID key goes to the browser as raw bytes.
    const options = subscribeSpy.mock.calls[0] as unknown as [{ applicationServerKey: Uint8Array; userVisibleOnly: boolean }];
    expect(options[0].userVisibleOnly).toBe(true);
    expect(options[0].applicationServerKey).toHaveLength(65);

    await user.click(within(section).getByRole("button", { name: "Send a test" }));
    expect(await within(section).findByText(/Test sent/)).toBeInTheDocument();
    expect(testPush).toHaveBeenCalledOnce();

    await user.click(within(section).getByRole("button", { name: "Turn off" }));
    expect(await within(section).findByText("Off for this device")).toBeInTheDocument();
    expect(unsubscribed).toEqual({ endpoint: "https://push.example.com/abc" });
  });

  it("tells the user when notifications are blocked", async () => {
    servePreferences("server-key");
    fakeBrowserPush();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission: async () => "denied" });
    renderWithProviders(<NotificationsSection />, { path: "/settings" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Notifications are blocked for this site");
  });

  it("words reminder notifications in both languages", async () => {
    expect(notificationText(i18n.t, { type: "reminder", taskTitle: "Call Ana" })).toBe("Reminder: Call Ana");
    await i18n.changeLanguage("pt");
    expect(notificationText(i18n.t, { type: "reminder", taskTitle: "Call Ana" })).toBe("Lembrete: Call Ana");
  });
});
