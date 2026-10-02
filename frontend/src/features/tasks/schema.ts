import type { TFunction } from "i18next";
import { z } from "zod";
import type { TaskInput } from "@/features/tasks/api";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import type { Task, TaskPriority, TaskRecurrence, TaskStatus } from "@/lib/types";

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
export const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
export const RECURRENCES: TaskRecurrence[] = ["daily", "weekly", "monthly"];
/** "Remind me" presets, in minutes before the due date. */
export const REMIND_OPTIONS = [0, 5, 15, 30, 60, 120, 1440];

/** "At the due time" / "15 minutes before" / "1 hour before" / "1 day before". */
export function remindLabel(t: TFunction, minutes: number): string {
  if (minutes === 0) return t("reminders.atDue");
  if (minutes % 1440 === 0) return t("reminders.days", { count: minutes / 1440 });
  if (minutes % 60 === 0) return t("reminders.hours", { count: minutes / 60 });
  return t("reminders.minutes", { count: minutes });
}

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

/** "day" / "days" for the "Every N …" field. */
export function recurrenceUnit(t: TFunction, recurrence: TaskRecurrence, interval: number): string {
  return t(`task.recurrenceUnit.${recurrence}`, { count: interval });
}

/** "Weekly", or "Every 2 weeks". */
export function recurrenceLabel(t: TFunction, recurrence: TaskRecurrence, interval: number): string {
  return t(`task.recurrence.${recurrence}`, { count: interval });
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Form values: everything is a string, as the inputs produce. Messages are translation keys. */
export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "validation.titleRequired").max(200, "validation.titleMax"),
    description: z.string().max(5000, "validation.descriptionMax"),
    status: z.enum(["todo", "in_progress", "done"]),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    dueAt: z.string().refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "validation.dateInvalid"),
    categoryId: z.string(),
    recurrence: z.enum(["", "daily", "weekly", "monthly"]),
    recurrenceInterval: z
      .string()
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365, "validation.intervalRange"),
    /** "" = no reminder, otherwise minutes before the due date. */
    remindBeforeMinutes: z.string(),
  })
  .refine((v) => v.recurrence === "" || v.dueAt !== "", {
    message: "validation.repeatNeedsDueDate",
    path: ["dueAt"],
  })
  .refine((v) => v.remindBeforeMinutes === "" || v.dueAt !== "", {
    message: "validation.reminderNeedsDueDate",
    path: ["dueAt"],
  });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const emptyTaskForm: TaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueAt: "",
  categoryId: "",
  recurrence: "",
  recurrenceInterval: "1",
  remindBeforeMinutes: "",
};

export function taskToForm(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    dueAt: toDateTimeLocal(task.dueAt),
    categoryId: task.categoryId === null ? "" : String(task.categoryId),
    recurrence: task.recurrence ?? "",
    recurrenceInterval: String(task.recurrenceInterval),
    remindBeforeMinutes: task.remindBeforeMinutes === null ? "" : String(task.remindBeforeMinutes),
  };
}

/** `existing` keeps an edited series in its original time zone. */
export function formToInput(values: TaskFormValues, existing?: Task | null): TaskInput {
  const recurrence = values.recurrence || null;
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    status: values.status,
    priority: values.priority,
    dueAt: fromDateTimeLocal(values.dueAt),
    categoryId: values.categoryId ? Number(values.categoryId) : null,
    recurrence,
    recurrenceInterval: recurrence ? Number(values.recurrenceInterval) : 1,
    recurrenceTimezone: recurrence ? (existing?.recurrenceTimezone ?? browserTimeZone()) : null,
    remindBeforeMinutes: values.remindBeforeMinutes === "" ? null : Number(values.remindBeforeMinutes),
  };
}
