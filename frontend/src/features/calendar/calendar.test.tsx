import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ToastProvider } from "@/components/ui/Toast";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { moveToDay, parseDayKey, visibleDays } from "@/features/calendar/dates";
import { useRescheduleTask } from "@/features/calendar/useRescheduleTask";
import { useTasks } from "@/features/tasks/hooks";
import i18n from "@/lib/i18n";
import { makeTask } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";
import type { Task } from "@/lib/types";

// Wednesday 15 May 2030, 10:00 local.
const NOW = new Date(2030, 4, 15, 10, 0);
const local = (month: number, day: number, h: number, m = 0) => new Date(2030, month - 1, day, h, m).toISOString();

describe("calendar dates", () => {
  it("covers whole Monday-first weeks around the month", () => {
    const may = visibleDays("month", new Date(2030, 4, 15));
    expect(may[0]).toEqual(new Date(2030, 3, 29)); // Monday 29 April
    expect(may.at(-1)).toEqual(new Date(2030, 5, 2)); // Sunday 2 June
    expect(may).toHaveLength(35);
    // February 2027 starts on a Monday and has exactly 4 weeks.
    expect(visibleDays("month", new Date(2027, 1, 10))).toHaveLength(28);
  });

  it("week view is Monday to Sunday", () => {
    const week = visibleDays("week", new Date(2030, 4, 19)); // a Sunday
    expect(week[0]).toEqual(new Date(2030, 4, 13));
    expect(week.at(-1)).toEqual(new Date(2030, 4, 19));
  });

  it("moving to another day keeps the time", () => {
    expect(moveToDay(new Date(2030, 4, 15, 9, 30), new Date(2030, 4, 22))).toEqual(new Date(2030, 4, 22, 9, 30));
  });

  it("parses day keys strictly", () => {
    expect(parseDayKey("2030-05-15")).toEqual(new Date(2030, 4, 15));
    expect(parseDayKey("15/05/2030")).toBeNull();
    expect(parseDayKey(null)).toBeNull();
  });
});

describe("CalendarPage", () => {
  let tasks: Task[];
  let requests: URLSearchParams[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    tasks = [
      makeTask({ id: 1, title: "Dentist", dueAt: local(5, 15, 9), priority: "high" }),
      makeTask({ id: 2, title: "Pay rent", dueAt: local(5, 20, 23, 59) }),
      makeTask({ id: 3, title: "Old thing", dueAt: local(5, 2, 12), status: "done" }),
      ...[1, 2, 3, 4].map((i) => makeTask({ id: 10 + i, title: `Busy ${i}`, dueAt: local(5, 28, 8 + i) })),
    ];
    requests = [];
    server.use(
      http.get(apiUrl("/categories"), () => ok([])),
      http.get(apiUrl("/tasks"), ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        const after = params.get("dueAfter")!;
        const before = params.get("dueBefore")!;
        const inRange = tasks.filter((t) => t.dueAt! >= after && t.dueAt! < before);
        return ok(inRange, { total: inRange.length, page: 1, pageSize: 500 });
      }),
    );
  });
  afterEach(() => vi.useRealTimers());

  const day = (name: RegExp) => screen.getByRole("group", { name });

  it("shows the month with each task on its day", async () => {
    renderWithProviders(<CalendarPage />, { path: "/calendar" });
    expect(await screen.findByRole("heading", { name: "May 2030" })).toBeInTheDocument();

    const params = requests.at(-1)!;
    expect(params.get("dueAfter")).toBe(new Date(2030, 3, 29).toISOString());
    expect(params.get("dueBefore")).toBe(new Date(2030, 5, 3).toISOString());
    expect(params.get("pageSize")).toBe("500");

    const wed15 = await waitFor(() => day(/^Wednesday, May 15, 1 task$/));
    expect(within(wed15).getByRole("button", { name: "09:00 AM, Dentist" })).toBeInTheDocument();
    // End-of-day due times aren't shown as a time.
    expect(within(day(/^Monday, May 20/)).getByRole("button", { name: "Pay rent" })).toBeInTheDocument();
    // Done tasks are shown, struck through.
    expect(within(day(/^Thursday, May 2,/)).getByText("Old thing")).toHaveClass("line-through");
  });

  it("collapses busy days and opens them in week view", async () => {
    const { user, router } = renderWithProviders(<CalendarPage />, { path: "/calendar" });
    const busy = await waitFor(() => day(/^Tuesday, May 28, 4 tasks$/));
    expect(within(busy).getAllByRole("button", { name: /Busy/ })).toHaveLength(3);

    await user.click(within(busy).getByRole("button", { name: "+1 more" }));

    expect(router.state.location.search).toBe("?view=week&date=2030-05-28");
    expect(await screen.findByRole("heading", { name: /May 27\s*–\s*Jun 2, 2030/ })).toBeInTheDocument();
    await waitFor(() => expect(within(day(/^Tuesday, May 28/)).getAllByRole("button", { name: /Busy/ })).toHaveLength(4));
  });

  it("navigates months and back to today", async () => {
    const { user, router } = renderWithProviders(<CalendarPage />, { path: "/calendar" });
    await screen.findByRole("heading", { name: "May 2030" });

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("heading", { name: "June 2030" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?date=2030-06-01");

    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "May 2030" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("");
  });

  it("opens a task, or starts a new one on a day at 09:00", async () => {
    const { user } = renderWithProviders(<CalendarPage />, { path: "/calendar" });
    await user.click(await screen.findByRole("button", { name: /Dentist/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Edit task");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "New task on Wednesday, May 22" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("New task");
    expect(within(dialog).getByLabelText("Due date")).toHaveValue("2030-05-22T09:00");
  });

  it("speaks Portuguese", async () => {
    await i18n.changeLanguage("pt");
    renderWithProviders(<CalendarPage />, { path: "/calendar" });
    expect(await screen.findByRole("heading", { name: "maio de 2030" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês seguinte" })).toBeInTheDocument();
  });
});

describe("useRescheduleTask", () => {
  function Harness() {
    const { data } = useTasks({ sort: "dueAt" });
    const reschedule = useRescheduleTask();
    const task = data?.data[0];
    return task ? (
      <div>
        <p data-testid="due">{task.dueAt}</p>
        <button onClick={() => reschedule.mutate({ task, dueAt: new Date(2030, 4, 22, 9, 30) })}>move</button>
      </div>
    ) : null;
  }

  function renderHarness() {
    const router = createMemoryRouter([{ path: "/", element: <Harness /> }]);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it("moves at once, sends the new date, and rolls back if the server refuses", async () => {
    const original = makeTask({ id: 1, dueAt: local(5, 15, 9, 30) });
    let body: unknown;
    let respond: (succeed: boolean) => void = () => {};
    server.use(
      http.get(apiUrl("/tasks"), () => ok([original], { total: 1, page: 1, pageSize: 20 })),
      http.patch(apiUrl("/tasks/1"), async ({ request }) => {
        body = await request.json();
        const succeed = await new Promise<boolean>((resolve) => (respond = resolve));
        return succeed ? ok(original) : fail(500, "INTERNAL_ERROR", "boom");
      }),
    );
    renderHarness();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "move" }));

    expect(screen.getByTestId("due")).toHaveTextContent(local(5, 22, 9, 30)); // optimistic
    await waitFor(() => expect(body).toEqual({ dueAt: local(5, 22, 9, 30) }));
    respond(false);
    await waitFor(() => expect(screen.getByTestId("due")).toHaveTextContent(local(5, 15, 9, 30)));
    expect(await screen.findByText(/Couldn't move the task/)).toBeInTheDocument();
  });
});
