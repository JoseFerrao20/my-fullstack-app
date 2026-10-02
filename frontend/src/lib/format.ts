import { intlLocale } from "@/lib/i18n";
import type { Task } from "@/lib/types";

export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleString(intlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function isOverdue(task: Pick<Task, "dueAt" | "status">, now = new Date()): boolean {
  return task.status !== "done" && task.dueAt !== null && new Date(task.dueAt) < now;
}

/** ISO string -> value for <input type="datetime-local"> (local time, no seconds). */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> timezone-aware ISO string, or null when empty. */
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
