import { screen, waitFor } from "@testing-library/react";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { notificationsKey } from "@/features/notifications/hooks";
import { makeNotification } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";
import type { Notification } from "@/lib/types";

describe("NotificationBell", () => {
  let notifications: Notification[];

  beforeEach(() => {
    notifications = [
      makeNotification({ id: 1, message: "Overdue: Write report" }),
      makeNotification({ id: 2, type: "due_soon", message: "Due soon: Call Bob" }),
      makeNotification({ id: 3, message: "Overdue: Old", readAt: "2026-01-01T00:00:00Z" }),
    ];
    server.use(
      http.get(apiUrl("/notifications"), () =>
        ok(notifications, { unreadCount: notifications.filter((n) => !n.readAt).length }),
      ),
    );
  });

  it("shows the unread count", async () => {
    renderWithProviders(<NotificationBell />);
    expect(await screen.findByTestId("unread-count")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Notifications (2 unread)" })).toBeInTheDocument();
  });

  it("marks a notification as read", async () => {
    server.use(
      http.patch(apiUrl("/notifications/1/read"), () => {
        notifications = notifications.map((n) => (n.id === 1 ? { ...n, readAt: new Date().toISOString() } : n));
        return ok(notifications[0]);
      }),
    );
    const { user } = renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications (2 unread)" }));
    await user.click(screen.getByRole("button", { name: /Overdue: Write report/ }));
    await waitFor(() => expect(screen.getByTestId("unread-count")).toHaveTextContent("1"));
  });

  it("marks all as read", async () => {
    server.use(
      http.post(apiUrl("/notifications/read-all"), () => {
        notifications = notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }));
        return ok(null, { updated: 2 });
      }),
    );
    const { user } = renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications (2 unread)" }));
    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(screen.queryByTestId("unread-count")).not.toBeInTheDocument());
  });

  it("toasts notifications that arrive after the first load", async () => {
    const { queryClient } = renderWithProviders(<NotificationBell />);
    await screen.findByTestId("unread-count");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    notifications = [makeNotification({ id: 9, message: "Overdue: New one" }), ...notifications];
    await queryClient.refetchQueries({ queryKey: notificationsKey });

    expect(await screen.findByRole("status")).toHaveTextContent("Overdue: New one");
  });
});
