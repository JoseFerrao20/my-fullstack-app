import { api } from "@/lib/apiClient";
import type { PageMeta, Task, TaskPriority, TaskStatus } from "@/lib/types";

export type TaskSort = "createdAt" | "-createdAt" | "dueAt" | "-dueAt" | "priority" | "-priority" | "title";

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
}

export const tasksApi = {
  list: (filters: TaskFilters) => api.get<Task[], PageMeta>("/tasks", { ...filters }),
  create: (input: TaskInput) => api.post<Task>("/tasks", input).then((r) => r.data),
  update: (id: number, input: Partial<TaskInput>) => api.patch<Task>(`/tasks/${id}`, input).then((r) => r.data),
  remove: (id: number) => api.delete(`/tasks/${id}`),
};
