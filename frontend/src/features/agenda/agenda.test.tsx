import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { MainNav } from "@/app/MainNav";
import { routes } from "@/app/router";
import { ToastProvider } from "@/components/ui/Toast";
import { TodayPage } from "@/features/agenda/TodayPage";
import { UpcomingPage } from "@/features/agenda/UpcomingPage";
import { makeTask, user } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";
import type { Task } from "@/lib/types";

// Monday 6 May 2030, 15:00 local time.
const NOW = new Date(2030, 4, 6, 15, 0);
const local = (day: number, hour: number) => new Date(2030, 4, day, hour, 0).toISOString();

describe("Agenda views", () => {
  let tasks: Task[];
  let requests: URLSearchParams[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    tasks = [
      makeTask({ id: 1, title: "Late report", dueAt: local(4, 9) }),
      makeTask({ id: 2, title: "Standup", dueAt: local(6, 9) }),
      makeTask({ id: 3, title: "Dentist", dueAt: local(7, 11) }),
      makeTask({ id: 4, title: "Pay rent", dueAt: local(9, 10) }),
      makeTask({ id: 5, title: "Far away", dueAt: local(20, 10) }),
    ];
    requests = [];
    server.use(
      http.get(apiUrl("/categories"), () => ok([])),
      http.get(apiUrl("/tasks"), ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        const after = params.get("dueAfter");
        const before = params.get("dueBefore");
        const matching = tasks.filter(
          (t) => t.dueAt && (!after || t.dueAt >= after) && (!before || t.dueAt < before),
        );
        return ok(matching, { total: matching.length, page: 1, pageSize: 100 });
      }),
    );
  });

  afterEach(() => vi.useRealTimers());

  it("Today asks for open tasks using the local day's boundaries", async () => {
    renderWithProviders(<TodayPage />, { path: "/today" });
    await screen.findByText("Standup");

    const overdue = requests.find((p) => !p.get("dueAfter"))!;
    const today = requests.find((p) => p.get("dueAfter"))!;
    expect(overdue.get("excludeDone")).toBe("true");
    expect(overdue.get("dueBefore")).toBe(new Date(2030, 4, 6).toISOString());
    expect(today.get("dueAfter")).toBe(new Date(2030, 4, 6).toISOString());
    expect(today.get("dueBefore")).toBe(new Date(2030, 4, 7).toISOString());
  });

  it("Today shows overdue and due-today sections", async () => {
    renderWithProviders(<TodayPage />, { path: "/today" });

    const overdue = await screen.findByRole("region", { name: /Overdue/ });
    expect(within(overdue).getByText("Late report")).toBeInTheDocument();
    const dueToday = screen.getByRole("region", { name: /Due today/ });
    expect(within(dueToday).getByText("Standup")).toBeInTheDocument();
    expect(screen.queryByText("Dentist")).not.toBeInTheDocument();
    expect(screen.getByText("Monday, May 6")).toBeInTheDocument();
  });

  it("Today celebrates an empty day and hides an empty overdue section", async () => {
    tasks = [];
    renderWithProviders(<TodayPage />, { path: "/today" });
    expect(await screen.findByText("Nothing due today 🎉")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Overdue/ })).not.toBeInTheDocument();
  });

  it("Upcoming groups the next 7 days by day, from tomorrow", async () => {
    renderWithProviders(<UpcomingPage />, { path: "/upcoming" });

    const tomorrow = await screen.findByRole("region", { name: /Tomorrow · Tuesday, May 7/ });
    expect(within(tomorrow).getByText("Dentist")).toBeInTheDocument();
    const thursday = screen.getByRole("region", { name: /Thursday, May 9/ });
    expect(within(thursday).getByText("Pay rent")).toBeInTheDocument();
    // Days with nothing due are skipped; today and beyond 7 days are excluded.
    expect(screen.queryByRole("region", { name: /Wednesday, May 8/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Standup")).not.toBeInTheDocument();
    expect(screen.queryByText("Far away")).not.toBeInTheDocument();

    const params = requests[0];
    expect(params.get("dueAfter")).toBe(new Date(2030, 4, 7).toISOString());
    expect(params.get("dueBefore")).toBe(new Date(2030, 4, 14).toISOString());
  });

  it("Upcoming has an empty state", async () => {
    tasks = [];
    renderWithProviders(<UpcomingPage />, { path: "/upcoming" });
    expect(await screen.findByText("Nothing due in the next 7 days.")).toBeInTheDocument();
  });

  it("the nav badge counts overdue + due today", async () => {
    renderWithProviders(<MainNav />, { path: "/board" });
    expect(await screen.findByLabelText("2 tasks due today or overdue")).toHaveTextContent("2");
    // List and board both belong to "All tasks".
    expect(screen.getByRole("link", { name: "All tasks" })).toHaveAttribute("aria-current", "page");
  });

  it("opens on Today after login", async () => {
    server.use(
      http.get(apiUrl("/auth/me"), () => ok(user)),
      http.get(apiUrl("/notifications"), () => ok([], { unreadCount: 0 })),
    );
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/today");
  });
});
