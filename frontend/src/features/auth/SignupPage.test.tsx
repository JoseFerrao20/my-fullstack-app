import { screen } from "@testing-library/react";
import { SignupPage } from "@/features/auth/SignupPage";
import { user } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";

describe("SignupPage", () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl("/auth/me"), () => fail(401, "UNAUTHORIZED", "Not authenticated")),
      http.post(apiUrl("/auth/refresh"), () => fail(401, "UNAUTHORIZED", "Session expired")),
    );
  });

  it("requires a password of at least 8 characters", async () => {
    const { user: u } = renderWithProviders(<SignupPage />, { path: "/signup" });
    await u.type(await screen.findByLabelText("Name"), "Alice");
    await u.type(screen.getByLabelText("Email"), "alice@example.com");
    await u.type(screen.getByLabelText("Password"), "short");
    await u.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("Use at least 8 characters")).toBeInTheDocument();
  });

  it("shows EMAIL_TAKEN on the email field", async () => {
    server.use(
      http.post(apiUrl("/auth/signup"), () => fail(409, "EMAIL_TAKEN", "An account with this email already exists")),
    );
    const { user: u } = renderWithProviders(<SignupPage />, { path: "/signup" });
    await u.type(await screen.findByLabelText("Name"), "Alice");
    await u.type(screen.getByLabelText("Email"), "alice@example.com");
    await u.type(screen.getByLabelText("Password"), "password123");
    await u.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("signs up and navigates home", async () => {
    server.use(http.post(apiUrl("/auth/signup"), () => ok(user)));
    const { user: u } = renderWithProviders(<SignupPage />, {
      path: "/signup",
      routes: [{ path: "/", element: <p>Home page</p> }],
    });
    await u.type(await screen.findByLabelText("Name"), "Alice");
    await u.type(screen.getByLabelText("Email"), "alice@example.com");
    await u.type(screen.getByLabelText("Password"), "password123");
    await u.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });
});
