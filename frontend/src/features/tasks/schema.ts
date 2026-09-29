import { z } from "zod";
import type { TaskInput } from "@/features/tasks/api";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

/** Form values: everything is a string, as the inputs produce. */
export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  description: z.string().max(5000, "Keep it under 5000 characters"),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  dueAt: z.string().refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  categoryId: z.string(),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const emptyTaskForm: TaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueAt: "",
  categoryId: "",
};

export function taskToForm(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    dueAt: toDateTimeLocal(task.dueAt),
    categoryId: task.categoryId === null ? "" : String(task.categoryId),
  };
}

export function formToInput(values: TaskFormValues): TaskInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    status: values.status,
    priority: values.priority,
    dueAt: fromDateTimeLocal(values.dueAt),
    categoryId: values.categoryId ? Number(values.categoryId) : null,
  };
}
