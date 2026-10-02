import { addDays, dayKey, startOfDay } from "@/features/agenda/dates";

export { addDays, dayKey, startOfDay };

export type CalendarView = "month" | "week";

/** Monday of `date`'s week (weeks start on Monday). */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** "2030-05-15" → local midnight; null if malformed. */
export function parseDayKey(key: string | null): Date | null {
  const m = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The days shown for a view: whole weeks covering the month, or the 7 days of the week. */
export function visibleDays(view: CalendarView, anchor: Date): Date[] {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  const end = startOfWeek(addDays(addMonths(first, 1), -1)); // Monday of the month's last week
  const weeks = Math.round((end.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** Same local time of day, on another day (what dragging a task to a new day does). */
export function moveToDay(dueAt: Date, day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), dueAt.getHours(), dueAt.getMinutes());
}
