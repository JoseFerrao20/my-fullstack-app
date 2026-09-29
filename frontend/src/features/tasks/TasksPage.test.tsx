import { screen, waitFor, within } from "@testing-library/react";
import { TasksPage } from "@/features/tasks/TasksPage";
import { makeTask, workCategory } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";

describe("TasksPage", () => {
  let requests: URLSearchParams[];

  beforeEach(() => {
    requests = [];
    server.use(
      http.get(apiUrl("/categories"), () => ok([workCategory])),
      http.get(apiUrl("/tasks"), ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        const tasks =
          params.get("priority") === "urgent"
            ? [makeTask({ id: 2, title: "Urgent thing", priority: "urgent" })]
            : [
                makeTask({ id: 1, title: "Write report", category: workCategory, categoryId: workCategory.id }),
                makeTask({ id: 2, title: "Urgent thing", priority: "urgent" }),
              ];
        return ok(tasks, { total: tasks.length, page: 1, pageSize: 20 });
      }),
    );
  });

  it("lists tasks with their badges", async () => {
    renderWithProviders(<TasksPage />);
    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(within(list).getByText("Write report")).toBeInTheDocument();
    expect(within(list).getByText("Urgent")).toBeInTheDocument();
    expect(within(list).getByText("Work")).toBeInTheDocument();
  });

  it("sends filter changes to the API and updates the URL", async () => {
    const { user, router } = renderWithProviders(<TasksPage />);
    await screen.findByText("Write report");

    await user.selectOptions(screen.getByLabelText("Priority"), "urgent");

    await waitFor(() => expect(screen.queryByText("Write report")).not.toBeInTheDocument());
    expect(requests.at(-1)?.get("priority")).toBe("urgent");
    expect(router.state.location.search).toBe("?priority=urgent");
  });

  it("debounces the search box", async () => {
    const { user } = renderWithProviders(<TasksPage />);
    await screen.findByText("Write report");
    const before = requests.length;

    await user.type(screen.getByLabelText("Search"), "report");

    await waitFor(() => expect(requests.at(-1)?.get("q")).toBe("report"));
    // One request for the final value, not one per keystroke.
    expect(requests.length - before).toBe(1);
  });

  it("toggles completion via PATCH", async () => {
    let body: unknown;
    server.use(
      http.patch(apiUrl("/tasks/1"), async ({ request }) => {
        body = await request.json();
        return ok(makeTask({ id: 1, status: "done" }));
      }),
      http.get(apiUrl("/notifications"), () => ok([], { unreadCount: 0 })),
    );
    const { user } = renderWithProviders(<TasksPage />);
    await user.click(await screen.findByRole("checkbox", { name: 'Mark "Write report" as done' }));
    await waitFor(() => expect(body).toEqual({ status: "done" }));
  });

  it("shows an empty state", async () => {
    server.use(http.get(apiUrl("/tasks"), () => ok([], { total: 0, page: 1, pageSize: 20 })));
    renderWithProviders(<TasksPage />);
    expect(await screen.findByText("No tasks yet. Create your first one!")).toBeInTheDocument();
  });
});
