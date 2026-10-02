import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/app/Layout";
import { SettingsPage } from "@/features/account/SettingsPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { BoardPage } from "@/features/board/BoardPage";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { SignupPage } from "@/features/auth/SignupPage";
import { TasksPage } from "@/features/tasks/TasksPage";

export const routes = [
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <TasksPage /> },
      { path: "board", element: <BoardPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
