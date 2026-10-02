import { screen, waitFor, within } from "@testing-library/react";
import { parseQuickAdd } from "@/features/quickadd/parse";
import { TasksPage } from "@/features/tasks/TasksPage";
import i18n from "@/lib/i18n";
import { makeTask } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";
import type { Category } from "@/lib/types";

const casa: Category = { id: 5, name: "Casa", color: "#22c55e", createdAt: "2026-01-01T00:00:00Z" };

describe("Quick add", () => {
  let posted: Record<string, unknown>[];
  let categories: Category[];

  beforeEach(() => {
    posted = [];
    categories = [casa];
    server.use(
      http.get(apiUrl("/categories"), () => ok(categories)),
      http.get(apiUrl("/tasks"), () => ok([], { total: 0, page: 1, pageSize: 20 })),
      http.post(apiUrl("/tasks"), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posted.push(body);
        return ok(makeTask({ id: 99, title: body.title as string }));
      }),
    );
  });

  const input = () => screen.getByRole("textbox", { name: "Quick add a task" });

  it("shows what it understood and creates the task on Enter", async () => {
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await screen.findByText("No tasks yet. Create your first one!");
    const text = "Pagar renda dia 1 todos os meses #casa !alta";

    await user.type(input(), text);

    expect(screen.getByText("“Pagar renda”")).toBeInTheDocument();
    expect(screen.getByTestId("chip-repeat")).toHaveTextContent("↻ Monthly");
    expect(screen.getByTestId("chip-category")).toHaveTextContent("#Casa"); // matched the existing one
    expect(screen.getByTestId("chip-priority")).toHaveTextContent("High");
    expect(screen.getByTestId("chip-due")).toBeInTheDocument();

    await user.keyboard("{Enter}");

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      title: "Pagar renda",
      description: null,
      status: "todo",
      priority: "high",
      dueAt: parseQuickAdd(text).dueAt!.toISOString(),
      categoryId: 5,
      recurrence: "monthly",
      recurrenceInterval: 1,
      recurrenceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      remindBeforeMinutes: null,
      tags: [],
    });
    expect(await screen.findByText("Added “Pagar renda”")).toBeInTheDocument();
    expect(input()).toHaveValue("");
  });

  it("creates a new category when the #tag doesn't exist yet", async () => {
    let newCategory: unknown;
    server.use(
      http.post(apiUrl("/categories"), async ({ request }) => {
        newCategory = await request.json();
        const created = { ...casa, id: 6, name: "Trabalho" };
        categories = [...categories, created];
        return ok(created);
      }),
    );
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await screen.findByText("No tasks yet. Create your first one!");

    await user.type(input(), "Relatório #Trabalho");
    expect(screen.getByTestId("chip-category")).toHaveTextContent("#Trabalho (new)");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(newCategory).toEqual({ name: "Trabalho", color: "#6366f1" });
    expect(posted[0]).toMatchObject({ title: "Relatório", categoryId: 6, dueAt: null, recurrence: null });
  });

  it("asks for a title when only a date was typed", async () => {
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await user.type(input(), "amanhã às 9h{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Type what the task is, not just when.");
    expect(posted).toHaveLength(0);
  });

  it("Escape clears the box", async () => {
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await user.type(input(), "Ligar à Ana amanhã");
    await user.keyboard("{Escape}");
    expect(input()).toHaveValue("");
  });

  it("“More details…” opens the full form, pre-filled", async () => {
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await screen.findByText("No tasks yet. Create your first one!");
    await user.type(input(), "Ginásio todas as semanas #casa !urgente");
    await user.click(screen.getByRole("button", { name: "More details…" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("New task");
    // The page has its own Priority/Category filters, so look inside the dialog.
    const form = within(dialog);
    expect(form.getByLabelText("Title")).toHaveValue("Ginásio");
    expect(form.getByLabelText("Priority")).toHaveValue("urgent");
    expect(form.getByLabelText("Repeat")).toHaveValue("weekly");
    await waitFor(() => expect(form.getByLabelText("Category")).toHaveValue("5"));
    expect((form.getByLabelText("Due date") as HTMLInputElement).value).not.toBe("");
    expect(input()).toHaveValue("");
  });

  it("speaks Portuguese too", async () => {
    await i18n.changeLanguage("pt");
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await user.type(screen.getByRole("textbox", { name: "Adicionar tarefa rapidamente" }), "Regar plantas a cada 2 dias #jardim");
    expect(screen.getByTestId("chip-repeat")).toHaveTextContent("A cada 2 dias");
    expect(screen.getByTestId("chip-category")).toHaveTextContent("#jardim (nova)");
  });
});
