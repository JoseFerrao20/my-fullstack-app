import { screen, waitFor, within } from "@testing-library/react";
import { SettingsPage } from "@/features/account/SettingsPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import i18n from "@/lib/i18n";
import { user } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";

const loggedOut = () =>
  server.use(
    http.get(apiUrl("/auth/me"), () => fail(401, "UNAUTHORIZED", "Not authenticated")),
    http.post(apiUrl("/auth/refresh"), () => fail(401, "UNAUTHORIZED", "Session expired")),
  );

const section = (name: string) => screen.getByRole("region", { name });

describe("Forgot password", () => {
  it("is linked from the login page", async () => {
    loggedOut();
    renderWithProviders(<LoginPage />, { path: "/login" });
    expect(await screen.findByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
  });

  it("requests a link in the current language and confirms without revealing anything", async () => {
    loggedOut();
    let body: unknown;
    server.use(
      http.post(apiUrl("/auth/password-reset/request"), async ({ request }) => {
        body = await request.json();
        return ok(null);
      }),
    );
    const { user: u } = renderWithProviders(<ForgotPasswordPage />, { path: "/forgot-password" });

    await u.type(screen.getByLabelText("Email"), "alice@example.com");
    await u.click(screen.getByRole("button", { name: "Send link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for alice@example.com, we've sent it a link",
    );
    expect(body).toEqual({ email: "alice@example.com", locale: "en" });
  });
});

describe("Reset password", () => {
  beforeEach(loggedOut);

  it("explains when the link has no token", () => {
    renderWithProviders(<ResetPasswordPage />, { path: "/reset-password" });
    expect(screen.getByRole("alert")).toHaveTextContent("This link is incomplete.");
    expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
  });

  it("checks that the passwords match", async () => {
    const { user: u } = renderWithProviders(<ResetPasswordPage />, { path: "/reset-password?token=abc" });
    await u.type(screen.getByLabelText("New password"), "brand-new-pass");
    await u.type(screen.getByLabelText("Confirm new password"), "something-else");
    await u.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();
  });

  it("sets the new password and sends you to log in", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/auth/password-reset/confirm"), async ({ request }) => {
        body = await request.json();
        return ok(null);
      }),
    );
    const { user: u } = renderWithProviders(<ResetPasswordPage />, {
      path: "/reset-password?token=abc123",
      routes: [{ path: "/login", element: <LoginPage /> }],
    });
    await u.type(screen.getByLabelText("New password"), "brand-new-pass");
    await u.type(screen.getByLabelText("Confirm new password"), "brand-new-pass");
    await u.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Your password was changed. Log in with the new one.")).toBeInTheDocument();
    expect(body).toEqual({ token: "abc123", newPassword: "brand-new-pass" });
  });

  it("offers a new link when this one is invalid", async () => {
    server.use(
      http.post(apiUrl("/auth/password-reset/confirm"), () =>
        fail(400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired"),
      ),
    );
    const { user: u } = renderWithProviders(<ResetPasswordPage />, { path: "/reset-password?token=old" });
    await u.type(screen.getByLabelText("New password"), "brand-new-pass");
    await u.type(screen.getByLabelText("Confirm new password"), "brand-new-pass");
    await u.click(screen.getByRole("button", { name: "Save new password" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This reset link is invalid or has expired.");
    expect(within(alert).getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
  });
});

describe("Settings", () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl("/auth/me"), () => ok(user)),
      http.get(apiUrl("/reminders/preferences"), () =>
        ok({ emailReminders: true, pushReminders: true, dailyDigest: false, digestHour: 8, timezone: "UTC" }),
      ),
      http.get(apiUrl("/reminders/push/config"), () => ok({ publicKey: null })),
    );
  });
  afterEach(() => localStorage.clear());

  it("updates the name and language", async () => {
    let body: unknown;
    server.use(
      http.patch(apiUrl("/auth/me"), async ({ request }) => {
        body = await request.json();
        return ok({ ...user, name: "Alicia", locale: "pt" });
      }),
    );
    const { user: u } = renderWithProviders(<SettingsPage />, { path: "/settings" });
    const profile = await screen.findByRole("region", { name: "Profile" });

    expect(within(profile).getByLabelText("Email")).toHaveValue("alice@example.com");
    expect(within(profile).getByLabelText("Language")).toHaveValue(""); // follows the browser
    await u.clear(within(profile).getByLabelText("Name"));
    await u.type(within(profile).getByLabelText("Name"), "Alicia");
    await u.selectOptions(within(profile).getByLabelText("Language"), "pt");
    await u.click(within(profile).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ name: "Alicia", locale: "pt" }));
    expect(await screen.findByRole("heading", { name: "Definições" })).toBeInTheDocument();
    await i18n.changeLanguage("en");
  });

  it("changes the password", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/auth/password"), async ({ request }) => {
        body = await request.json();
        return ok(null);
      }),
    );
    const { user: u } = renderWithProviders(<SettingsPage />, { path: "/settings" });
    const form = await screen.findByRole("region", { name: "Password" });

    await u.type(within(form).getByLabelText("Current password"), "password123");
    await u.type(within(form).getByLabelText("New password"), "brand-new-pass");
    await u.type(within(form).getByLabelText("Confirm new password"), "brand-new-pass");
    await u.click(within(form).getByRole("button", { name: "Change password" }));

    expect(await within(form).findByRole("status")).toHaveTextContent("Password changed.");
    expect(body).toEqual({ currentPassword: "password123", newPassword: "brand-new-pass" });
    expect(within(form).getByLabelText("Current password")).toHaveValue("");
  });

  it("shows a wrong current password on its field", async () => {
    server.use(
      http.post(apiUrl("/auth/password"), () =>
        fail(400, "INVALID_PASSWORD", "The password is incorrect", [
          { field: "currentPassword", message: "The password is incorrect" },
        ]),
      ),
    );
    const { user: u } = renderWithProviders(<SettingsPage />, { path: "/settings" });
    const form = await screen.findByRole("region", { name: "Password" });
    await u.type(within(form).getByLabelText("Current password"), "nope");
    await u.type(within(form).getByLabelText("New password"), "brand-new-pass");
    await u.type(within(form).getByLabelText("Confirm new password"), "brand-new-pass");
    await u.click(within(form).getByRole("button", { name: "Change password" }));

    expect(await within(form).findByText("The password is incorrect")).toBeInTheDocument();
    expect(within(form).getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  it("logs out on all devices", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const logoutAll = vi.fn(() => ok(null, { sessionsEnded: 2 }));
    server.use(http.post(apiUrl("/auth/logout-all"), logoutAll));
    const { user: u, router } = renderWithProviders(<SettingsPage />, {
      path: "/settings",
      routes: [{ path: "/login", element: <p>Login page</p> }],
    });
    await u.click(await within(await screen.findByRole("region", { name: "Sessions" })).findByRole("button"));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(logoutAll).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("deletes the account after confirming with the password", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    let body: unknown;
    server.use(
      http.delete(apiUrl("/auth/me"), async ({ request }) => {
        body = await request.json();
        return ok(null);
      }),
    );
    const { user: u } = renderWithProviders(<SettingsPage />, {
      path: "/settings",
      routes: [{ path: "/signup", element: <p>Signup page</p> }],
    });
    const danger = await screen.findByRole("region", { name: "Delete account" });
    const button = within(danger).getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();

    await u.type(within(danger).getByLabelText("Confirm with your password"), "password123");
    await u.click(button);

    expect(await screen.findByText("Signup page")).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalled();
    expect(body).toEqual({ password: "password123" });
  });

  it("keeps the account when the deletion isn't confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const remove = vi.fn(() => ok(null));
    server.use(http.delete(apiUrl("/auth/me"), remove));
    const { user: u } = renderWithProviders(<SettingsPage />, { path: "/settings" });
    const danger = await screen.findByRole("region", { name: "Delete account" });
    await u.type(within(danger).getByLabelText("Confirm with your password"), "password123");
    await u.click(within(danger).getByRole("button", { name: "Delete my account" }));
    expect(remove).not.toHaveBeenCalled();
    expect(section("Delete account")).toBeInTheDocument();
  });
});
