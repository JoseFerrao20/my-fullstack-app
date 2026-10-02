import { api } from "@/lib/apiClient";
import type { PageMeta, Task, TaskPriority, TaskRecurrence, TaskStatus } from "@/lib/types";

export type TaskSort = "createdAt" | "-createdAt" | "dueAt" | "-dueAt" | "priority" | "-priority" | "title" | "-completedAt";

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  categoryId?: number;
  q?: string;
  sort?: TaskSort;
  page?: number;
  pageSize?: number;
}

export interface TaskInput {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  categoryId: number | null;
  recurrence: TaskRecurrence | null;
  recurrenceInterval: number;
  /** IANA zone the due time is kept in for repeats; filled from the browser. */
  recurrenceTimezone: string | null;
}

/** Set when completing a recurring task created its next occurrence. */
export interface TaskUpdateMeta {
  nextOccurrence?: { id: number; dueAt: string };
}

export const tasksApi = {
  list: (filters: TaskFilters) => api.get<Task[], PageMeta>("/tasks", { ...filters }),
  create: (input: TaskInput) => api.post<Task>("/tasks", input).then((r) => r.data),
  update: (id: number, input: Partial<TaskInput>) => api.patch<Task, TaskUpdateMeta | null>(`/tasks/${id}`, input),
  remove: (id: number) => api.delete(`/tasks/${id}`),
};
