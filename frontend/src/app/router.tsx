import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/app/Layout";
import { TodayPage } from "@/features/agenda/TodayPage";
import { UpcomingPage } from "@/features/agenda/UpcomingPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { SignupPage } from "@/features/auth/SignupPage";
import { TasksPage } from "@/features/tasks/TasksPage";

// Pages that aren't on the everyday path load on demand (keeps the first download small;
// the board and calendar also bring in the drag-and-drop library).
const lazyPage = <T,>(load: () => Promise<T>, pick: (module: T) => React.ComponentType) => async () => ({
  Component: pick(await load()),
});

export const routes = [
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  {
    path: "/forgot-password",
    lazy: lazyPage(() => import("@/features/auth/ForgotPasswordPage"), (m) => m.ForgotPasswordPage),
  },
  {
    path: "/reset-password",
    lazy: lazyPage(() => import("@/features/auth/ResetPasswordPage"), (m) => m.ResetPasswordPage),
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      // "Today" is home; the full filterable list lives at /tasks.
      { index: true, element: <Navigate to="/today" replace /> },
      { path: "today", element: <TodayPage /> },
      { path: "upcoming", element: <UpcomingPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "calendar", lazy: lazyPage(() => import("@/features/calendar/CalendarPage"), (m) => m.CalendarPage) },
      { path: "board", lazy: lazyPage(() => import("@/features/board/BoardPage"), (m) => m.BoardPage) },
      { path: "settings", lazy: lazyPage(() => import("@/features/account/SettingsPage"), (m) => m.SettingsPage) },
      { path: "trash", lazy: lazyPage(() => import("@/features/trash/TrashPage"), (m) => m.TrashPage) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
