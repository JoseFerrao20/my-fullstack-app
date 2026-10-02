import { screen, waitFor, within } from "@testing-library/react";
import { TaskCard } from "@/features/board/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { TaskItem } from "@/features/tasks/TaskItem";
import { TasksPage } from "@/features/tasks/TasksPage";
import { makeTask } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";
import type { Subtask } from "@/lib/types";

const step = (id: number, title: string, done = false, position = id): Subtask => ({ id, title, done, position });

describe("Checklist while creating a task", () => {
  it("keeps typed steps in order and saves them after the task", async () => {
    const calls: string[] = [];
    server.use(
      http.get(apiUrl("/categories"), () => ok([])),
      http.post(apiUrl("/tasks"), () => {
        calls.push("task");
        return ok(makeTask({ id: 42 }));
      }),
      http.post(apiUrl("/tasks/42/subtasks"), async ({ request }) => {
        calls.push(((await request.json()) as { title: string }).title);
        return ok(step(1, "x"));
      }),
    );
    const onClose = vi.fn();
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "Move house");
    const add = screen.getByLabelText("Add a step");
    await user.type(add, "Buy boxes{Enter}"); // Enter adds a step, it doesn't submit the form
    await user.type(add, "Book van");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Move “Book van” up" }));
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(["task", "Book van", "Buy boxes"]);
  });

  it("lets you rename and drop a draft step", async () => {
    server.use(http.get(apiUrl("/categories"), () => ok([])));
    const { user } = renderWithProviders(<TaskFormDialog open task={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Add a step"), "Typo{Enter}");
    await user.type(screen.getByLabelText("Add a step"), "Keep{Enter}");

    const typo = screen.getByLabelText("Step: Typo");
    await user.clear(typo);
    await user.type(typo, "Fixed{Enter}");
    expect(screen.getByLabelText("Step: Fixed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete step “Keep”" }));
    expect(screen.queryByLabelText("Step: Keep")).not.toBeInTheDocument();
  });
});

describe("Checklist on an existing task", () => {
  let steps: Subtask[];
  let requests: { method: string; path: string; body?: unknown }[];

  beforeEach(() => {
    steps = [step(1, "Buy boxes"), step(2, "Book van")];
    requests = [];
    const record = async ({ request }: { request: Request }) => {
      const body = request.method === "DELETE" ? undefined : await request.json();
      requests.push({ method: request.method, path: new URL(request.url).pathname, body });
      return ok(steps[0]);
    };
    server.use(
      http.get(apiUrl("/categories"), () => ok([])),
      http.get(apiUrl("/tasks/7/subtasks"), () => ok(steps)),
      http.patch(apiUrl("/tasks/7/subtasks/:id"), record),
      http.delete(apiUrl("/tasks/7/subtasks/:id"), record),
      http.put(apiUrl("/tasks/7/subtasks/order"), async (info) => {
        await record(info);
        return ok([steps[1], steps[0]]);
      }),
      http.post(apiUrl("/tasks/7/subtasks"), record),
    );
  });

  it("saves each change right away", async () => {
    const task = makeTask({ id: 7, subtasks: steps });
    const { user } = renderWithProviders(<TaskFormDialog open task={task} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("checkbox", { name: "Buy boxes" }));
    await user.click(screen.getByRole("button", { name: "Move “Buy boxes” down" }));
    await user.click(screen.getByRole("button", { name: "Delete step “Book van”" }));
    const title = screen.getByLabelText("Step: Buy boxes");
    await user.clear(title);
    await user.type(title, "Buy 20 boxes{Enter}");
    await user.type(screen.getByLabelText("Add a step"), "Pack kitchen{Enter}");

    await waitFor(() => expect(requests).toHaveLength(5));
    expect(requests).toEqual([
      { method: "PATCH", path: "/api/tasks/7/subtasks/1", body: { done: true } },
      { method: "PUT", path: "/api/tasks/7/subtasks/order", body: { ids: [2, 1] } },
      { method: "DELETE", path: "/api/tasks/7/subtasks/2", body: undefined },
      { method: "PATCH", path: "/api/tasks/7/subtasks/1", body: { title: "Buy 20 boxes" } },
      { method: "POST", path: "/api/tasks/7/subtasks", body: { title: "Pack kitchen" } },
    ]);
  });
});

describe("Progress in task lists", () => {
  const task = makeTask({ id: 9, title: "Move house", subtasks: [step(1, "Buy boxes", true), step(2, "Book van")] });

  it("shows progress on the board card", () => {
    renderWithProviders(<TaskCard task={task} onOpen={vi.fn()} onMove={vi.fn()} />);
    expect(screen.getByRole("img", { name: "1 of 2 steps done" })).toHaveTextContent("1/2");
  });

  it("hides the badge for tasks without steps", () => {
    renderWithProviders(<TaskItem task={makeTask()} onEdit={vi.fn()} />);
    expect(screen.queryByText(/steps done/)).not.toBeInTheDocument();
  });

  it("ticks steps from the list, instantly, and rolls back on error", async () => {
    let release: (ok: boolean) => void = () => {};
    server.use(
      http.patch(apiUrl("/tasks/9/subtasks/2"), async () => {
        const succeed = await new Promise<boolean>((resolve) => (release = resolve));
        return succeed ? ok(step(2, "Book van", true)) : fail(500, "INTERNAL_ERROR", "boom");
      }),
      http.get(apiUrl("/tasks"), () => ok([task], { total: 1, page: 1, pageSize: 20 })),
    );
    // Render inside a task list query so the optimistic update has a cache to change.
    server.use(http.get(apiUrl("/categories"), () => ok([])));
    const { user } = renderWithProviders(<TasksPage />, { path: "/tasks" });

    const badge = await screen.findByRole("button", { name: /1 of 2 steps done/ });
    await user.click(badge);
    const list = screen.getByRole("list", { name: "Steps" });
    await user.click(within(list).getByRole("checkbox", { name: "Book van" }));

    // Optimistic: already 2/2 while the request is pending.
    expect(await screen.findByRole("button", { name: /2 of 2 steps done/ })).toBeInTheDocument();
    release(false);
    expect(await screen.findByRole("button", { name: /1 of 2 steps done/ })).toBeInTheDocument();
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});
