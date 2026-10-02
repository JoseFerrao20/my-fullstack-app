import { screen } from "@testing-library/react";
import { TaskItem } from "@/features/tasks/TaskItem";
import { formatDueDate } from "@/lib/format";
import { makeTask } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";

describe("TaskItem", () => {
  it("shows the repeat rule", () => {
    renderWithProviders(<TaskItem task={makeTask({ recurrence: "weekly", recurrenceInterval: 2 })} onEdit={vi.fn()} />);
    expect(screen.getByText("Every 2 weeks")).toBeInTheDocument();
  });

  it("announces the next occurrence when completing a repeating task", async () => {
    const task = makeTask({ id: 7, title: "Standup", dueAt: "2030-05-06T09:00:00Z", recurrence: "weekly" });
    const nextDue = "2030-05-13T09:00:00Z";
    server.use(
      http.patch(apiUrl("/tasks/7"), () =>
        ok({ ...task, status: "done", nextOccurrenceId: 8 }, { nextOccurrence: { id: 8, dueAt: nextDue } }),
      ),
    );
    const { user } = renderWithProviders(<TaskItem task={task} onEdit={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: 'Mark "Standup" as done' }));

    expect(await screen.findByText(`Next "Standup" scheduled for ${formatDueDate(nextDue)}`)).toBeInTheDocument();
  });

  it("stays quiet when completing a one-off task", async () => {
    server.use(http.patch(apiUrl("/tasks/1"), () => ok(makeTask({ id: 1, status: "done" }))));
    const { user } = renderWithProviders(<TaskItem task={makeTask({ id: 1 })} onEdit={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: 'Mark "Write report" as done' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/scheduled for/)).not.toBeInTheDocument();
  });
});
