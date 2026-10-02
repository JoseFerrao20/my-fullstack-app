import { screen, waitFor } from "@testing-library/react";
import { Layout } from "@/app/Layout";
import { LoginPage } from "@/features/auth/LoginPage";
import { TaskItem } from "@/features/tasks/TaskItem";
import { ApiError } from "@/lib/apiClient";
import { errorMessage } from "@/lib/errors";
import i18n, { setLanguage } from "@/lib/i18n";
import { makeTask, user } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";

const loggedOut = () =>
  server.use(
    http.get(apiUrl("/auth/me"), () => fail(401, "UNAUTHORIZED", "Not authenticated")),
    http.post(apiUrl("/auth/refresh"), () => fail(401, "UNAUTHORIZED", "Session expired")),
  );

describe("Portuguese UI", () => {
  afterEach(() => localStorage.clear());

  it("renders the login page in Portuguese, validation included", async () => {
    loggedOut();
    await i18n.changeLanguage("pt");
    const { user: u } = renderWithProviders(<LoginPage />, { path: "/login" });

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByText("Não tem conta?")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Introduza um email válido")).toBeInTheDocument();
    expect(screen.getByText("A password é obrigatória")).toBeInTheDocument();
  });

  it("switches language from the login page and remembers it", async () => {
    loggedOut();
    const { user: u } = renderWithProviders(<LoginPage />, { path: "/login" });
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();

    await u.selectOptions(screen.getByLabelText("Language"), "pt");

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(localStorage.getItem("language")).toBe("pt");
    expect(document.documentElement.lang).toBe("pt");
  });

  it("saves the choice to the profile when logged in", async () => {
    let body: unknown;
    server.use(
      http.get(apiUrl("/auth/me"), () => ok(user)),
      http.get(apiUrl("/notifications"), () => ok([], { unreadCount: 0 })),
      http.patch(apiUrl("/auth/me"), async ({ request }) => {
        body = await request.json();
        return ok({ ...user, locale: "pt" });
      }),
    );
    const { user: u } = renderWithProviders(<Layout />);
    await u.selectOptions(await screen.findByLabelText("Language"), "pt");

    await waitFor(() => expect(body).toEqual({ locale: "pt" }));
    expect(await screen.findByRole("button", { name: "Terminar sessão" })).toBeInTheDocument();
  });

  it("applies the language saved on the profile", async () => {
    server.use(
      http.get(apiUrl("/auth/me"), () => ok({ ...user, locale: "pt" })),
      http.get(apiUrl("/notifications"), () => ok([], { unreadCount: 0 })),
    );
    renderWithProviders(<Layout />);
    expect(await screen.findByRole("button", { name: "Terminar sessão" })).toBeInTheDocument();
  });

  it("translates task labels, plurals included", async () => {
    await i18n.changeLanguage("pt");
    renderWithProviders(
      <TaskItem task={makeTask({ priority: "high", recurrence: "weekly", recurrenceInterval: 2 })} onEdit={vi.fn()} />,
    );
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText("A cada 2 semanas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar «Write report»" })).toBeInTheDocument();
  });

  it("translates server error codes and keeps unknown messages", async () => {
    await i18n.changeLanguage("pt");
    const t = i18n.t;
    expect(errorMessage(new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password"), t)).toBe(
      "Email ou password incorretos",
    );
    expect(errorMessage(new ApiError(429, "TOO_MANY_REQUESTS", "x", { retryAfter: 61 }), t)).toBe(
      "Demasiadas tentativas. Tente novamente daqui a 2 minutos.",
    );
    expect(errorMessage(new ApiError(418, "TEAPOT", "I'm a teapot"), t)).toBe("I'm a teapot");
    expect(errorMessage(new Error("boom"), t)).toBe("Algo correu mal");
  });

  it("setLanguage(null) goes back to following the browser", async () => {
    setLanguage("pt");
    setLanguage(null);
    await waitFor(() => expect(i18n.language).toBe("en")); // jsdom's navigator.language is en-US
    expect(localStorage.getItem("language")).toBeNull();
  });
});
