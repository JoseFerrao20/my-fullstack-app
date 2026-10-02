import { screen } from "@testing-library/react";
import { LoginPage } from "@/features/auth/LoginPage";
import { user } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";

function renderLogin() {
  return renderWithProviders(<LoginPage />, {
    path: "/login",
    routes: [{ path: "/", element: <p>Home page</p> }],
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl("/auth/me"), () => fail(401, "UNAUTHORIZED", "Not authenticated")),
      http.post(apiUrl("/auth/refresh"), () => fail(401, "UNAUTHORIZED", "Session expired")),
    );
  });

  it("validates fields before submitting", async () => {
    const { user: u } = renderLogin();
    await u.click(await screen.findByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
  });

  it("logs in and navigates home", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/auth/login"), async ({ request }) => {
        body = await request.json();
        return ok(user);
      }),
    );
    const { user: u } = renderLogin();

    await u.type(await screen.findByLabelText("Email"), "alice@example.com");
    await u.type(screen.getByLabelText("Password"), "password123");
    await u.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(body).toEqual({ email: "alice@example.com", password: "password123" });
  });

  it("says how long to wait when rate limited", async () => {
    server.use(
      http.post(apiUrl("/auth/login"), () =>
        fail(429, "TOO_MANY_REQUESTS", "Too many attempts. Try again later.", { retryAfter: 600 }),
      ),
    );
    const { user: u } = renderLogin();

    await u.type(await screen.findByLabelText("Email"), "alice@example.com");
    await u.type(screen.getByLabelText("Password"), "password123");
    await u.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many failed attempts. Try again in 10 minutes.");
  });

  it("shows the server error on bad credentials", async () => {
    server.use(
      http.post(apiUrl("/auth/login"), () => fail(401, "INVALID_CREDENTIALS", "Invalid email or password")),
    );
    const { user: u } = renderLogin();

    await u.type(await screen.findByLabelText("Email"), "alice@example.com");
    await u.type(screen.getByLabelText("Password"), "wrong-password");
    await u.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });
});
