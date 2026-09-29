import type { Category, Notification, Task, User } from "@/lib/types";

export const user: User = {
  id: 1,
  email: "alice@example.com",
  name: "Alice",
  createdAt: "2026-01-01T00:00:00Z",
};

export const workCategory: Category = {
  id: 10,
  name: "Work",
  color: "#ff0000",
  createdAt: "2026-01-01T00:00:00Z",
};

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 100,
    title: "Write report",
    description: null,
    status: "todo",
    priority: "medium",
    dueAt: null,
    completedAt: null,
    categoryId: null,
    category: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1000,
    taskId: 100,
    type: "overdue",
    message: "Overdue: Write report",
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
