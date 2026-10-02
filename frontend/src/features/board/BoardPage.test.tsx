import { screen, waitFor, within } from "@testing-library/react";
import { BoardPage } from "@/features/board/BoardPage";
import { makeTask, workCategory } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";
import type { Task } from "@/lib/types";

function column(name: string) {
  return screen.getByRole("region", { name });
}

describe("BoardPage", () => {
  let tasks: Task[];
  let requests: URLSearchParams[];

  beforeEach(() => {
    tasks = [
      makeTask({ id: 1, title: "Write report", status: "todo", priority: "high", category: workCategory, categoryId: 10 }),
      makeTask({ id: 2, title: "Review PR", status: "in_progress" }),
      makeTask({ id: 3, title: "Ship v1", status: "done", completedAt: "2026-01-02T00:00:00Z" }),
    ];
    requests = [];
    server.use(
      http.get(apiUrl("/categories"), () => ok([workCategory])),
      http.get(apiUrl("/notifications"), () => ok([], { unreadCount: 0 })),
      http.get(apiUrl("/tasks"), ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        const matching = tasks.filter(
          (t) =>
            t.status === params.get("status") &&
            (!params.get("priority") || t.priority === params.get("priority")),
        );
        const pageSize = Number(params.get("pageSize"));
        return ok(matching.slice(0, pageSize), { total: matching.length, page: 1, pageSize });
      }),
    );
  });

  it("shows each task in its status column with counts", async () => {
    renderWithProviders(<BoardPage />, { path: "/board" });

    expect(await within(column("To do")).findByText("Write report")).toBeInTheDocument();
    expect(await within(column("In progress")).findByText("Review PR")).toBeInTheDocument();
    expect(await within(column("Done")).findByText("Ship v1")).toBeInTheDocument();
    expect(within(column("To do")).getByLabelText("1 task")).toBeInTheDocument();
    expect(within(column("To do")).getByText("Work")).toBeInTheDocument();
  });

  it("requests each column with its own sort and limit", async () => {
    renderWithProviders(<BoardPage />, { path: "/board" });
    await screen.findByText("Ship v1");

    const byStatus = Object.fromEntries(requests.map((p) => [p.get("status"), p]));
    expect(byStatus.todo.get("sort")).toBe("-priority");
    expect(byStatus.todo.get("pageSize")).toBe("100");
    expect(byStatus.done.get("sort")).toBe("-completedAt");
    expect(byStatus.done.get("pageSize")).toBe("20");
  });

  it("moves a card immediately and sends the new status", async () => {
    let release: () => void = () => {};
    let body: unknown;
    server.use(
      http.patch(apiUrl("/tasks/1"), async ({ request }) => {
        body = await request.json();
        await new Promise<void>((resolve) => (release = resolve));
        tasks = tasks.map((t) => (t.id === 1 ? { ...t, status: "in_progress" } : t));
        return ok(tasks[0]);
      }),
    );
    const { user } = renderWithProviders(<BoardPage />, { path: "/board" });
    await within(column("To do")).findByText("Write report");

    await user.selectOptions(screen.getByLabelText('Move "Write report" to'), "in_progress");

    // Optimistic: already in the new column while the request is still pending.
    expect(within(column("In progress")).getByText("Write report")).toBeInTheDocument();
    expect(within(column("To do")).queryByText("Write report")).not.toBeInTheDocument();
    await waitFor(() => expect(body).toEqual({ status: "in_progress" }));

    release();
    await waitFor(() => expect(within(column("In progress")).getByLabelText("2 tasks")).toBeInTheDocument());
  });

  it("puts the card back and shows an error if the move fails", async () => {
    server.use(http.patch(apiUrl("/tasks/1"), () => fail(500, "INTERNAL_ERROR", "Internal server error")));
    const { user } = renderWithProviders(<BoardPage />, { path: "/board" });
    await within(column("To do")).findByText("Write report");

    await user.selectOptions(screen.getByLabelText('Move "Write report" to'), "done");

    // (dnd-kit adds its own role="status" live region, so match the toast by text.)
    expect(await screen.findByText(/Couldn't move the task/)).toBeInTheDocument();
    await waitFor(() => expect(within(column("To do")).getByText("Write report")).toBeInTheDocument());
    expect(within(column("Done")).queryByText("Write report")).not.toBeInTheDocument();
  });

  it("applies the shared filters to every column", async () => {
    const { user, router } = renderWithProviders(<BoardPage />, { path: "/board" });
    await screen.findByText("Ship v1");

    await user.selectOptions(screen.getByLabelText("Priority"), "high");

    await waitFor(() => expect(screen.queryByText("Ship v1")).not.toBeInTheDocument());
    expect(screen.getByText("Write report")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?priority=high");
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });

  it("links to the list when a column has more tasks than it shows", async () => {
    tasks = Array.from({ length: 25 }, (_, i) =>
      makeTask({ id: 100 + i, title: `Done ${i}`, status: "done", completedAt: "2026-01-02T00:00:00Z" }),
    );
    renderWithProviders(<BoardPage />, { path: "/board" });

    const link = await screen.findByRole("link", { name: "+5 more in the list" });
    expect(link).toHaveAttribute("href", "/tasks?status=done&sort=-completedAt");
  });
});
