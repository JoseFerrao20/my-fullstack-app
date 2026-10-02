import { screen, waitFor } from "@testing-library/react";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { makeTask, workCategory } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";

describe("TaskFormDialog", () => {
  beforeEach(() => {
    server.use(http.get(apiUrl("/categories"), () => ok([workCategory])));
  });

  it("requires a title", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("creates a task with camelCase fields and an ISO due date", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(apiUrl("/tasks"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return ok(makeTask({ title: body.title as string }));
      }),
    );
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "  Ship it  ");
    await user.selectOptions(screen.getByLabelText("Priority"), "urgent");
    await user.selectOptions(await screen.findByLabelText("Category"), await screen.findByRole("option", { name: "Work" }));
    await user.type(screen.getByLabelText("Due date"), "2030-05-01T09:30");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toEqual({
      title: "Ship it",
      description: null,
      status: "todo",
      priority: "urgent",
      dueAt: new Date("2030-05-01T09:30").toISOString(),
      categoryId: workCategory.id,
      recurrence: null,
      recurrenceInterval: 1,
      recurrenceTimezone: null,
    });
  });

  it("creates a repeating task with the browser's time zone", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(apiUrl("/tasks"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return ok(makeTask());
      }),
    );
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "Standup");
    await user.type(screen.getByLabelText("Due date"), "2030-05-06T09:00");
    expect(screen.queryByLabelText("Every")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Repeat"), "weekly");
    const every = screen.getByLabelText("Every");
    await user.clear(every);
    await user.type(every, "2");
    expect(screen.getByText("weeks")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toMatchObject({
      recurrence: "weekly",
      recurrenceInterval: 2,
      recurrenceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it("requires a due date for repeating tasks", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={onClose} />);
    await user.type(screen.getByLabelText("Title"), "Standup");
    await user.selectOptions(screen.getByLabelText("Repeat"), "daily");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Repeating tasks need a due date")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps an existing series in its original time zone", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(apiUrl("/tasks/:id"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return ok(makeTask());
      }),
    );
    const task = makeTask({
      id: 5,
      dueAt: "2030-05-06T09:00:00Z",
      recurrence: "monthly",
      recurrenceInterval: 3,
      recurrenceTimezone: "Asia/Tokyo",
    });
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={task} onClose={onClose} />);

    expect(screen.getByLabelText("Repeat")).toHaveValue("monthly");
    expect(screen.getByLabelText("Every")).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toMatchObject({ recurrence: "monthly", recurrenceInterval: 3, recurrenceTimezone: "Asia/Tokyo" });
  });

  it("prefills and patches an existing task", async () => {
    let body: Record<string, unknown> = {};
    let url = "";
    server.use(
      http.patch(apiUrl("/tasks/:id"), async ({ request }) => {
        url = request.url;
        body = (await request.json()) as Record<string, unknown>;
        return ok(makeTask());
      }),
    );
    const task = makeTask({ id: 7, title: "Old title", priority: "high", description: "Notes" });
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={task} onClose={onClose} />);

    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Old title");
    expect(screen.getByLabelText("Priority")).toHaveValue("high");

    await user.clear(title);
    await user.type(title, "New title");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(url).toMatch(/\/api\/tasks\/7$/);
    expect(body).toMatchObject({ title: "New title", priority: "high", description: "Notes", dueAt: null });
  });

  it("maps server field errors onto the form", async () => {
    server.use(
      http.post(apiUrl("/tasks"), () =>
        fail(422, "VALIDATION_ERROR", "Request validation failed", [
          { field: "categoryId", message: "Category does not exist" },
        ]),
      ),
    );
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Title"), "Task");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Category does not exist")).toBeInTheDocument();
  });
});
