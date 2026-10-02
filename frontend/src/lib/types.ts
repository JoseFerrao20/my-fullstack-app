// API DTOs (camelCase), mirroring the backend Pydantic schemas.
// `npm run gen:api` writes the full OpenAPI types to src/lib/api-types.ts for cross-checking.

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type NotificationType = "due_soon" | "overdue" | "reminder";
export type TaskRecurrence = "daily" | "weekly" | "monthly";

export interface User {
  id: number;
  email: string;
  name: string;
  /** "pt" | "en", or null to follow the browser. */
  locale: "pt" | "en" | null;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  categoryId: number | null;
  category: Category | null;
  recurrence: TaskRecurrence | null;
  recurrenceInterval: number;
  recurrenceTimezone: string | null;
  nextOccurrenceId: number | null;
  /** Minutes before dueAt to remind (0 = at the due time), or null for none. */
  remindBeforeMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: number;
  taskId: number;
  taskTitle: string;
  type: NotificationType;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
}
