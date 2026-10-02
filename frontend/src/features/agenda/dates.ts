import { useEffect, useState } from "react";
import type { TaskFilters } from "@/features/tasks/api";

export const UPCOMING_DAYS = 7;

/** Local midnight at the start of `date`'s day. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar arithmetic in local time (a DST day is still one day). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** "2030-05-06" for grouping tasks by local day. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Start of the user's local today. Stable for the whole day (so query keys don't change on
 * every render) and rolls over at midnight or when the tab comes back after the day changed.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const refresh = () => {
      const now = startOfDay(new Date());
      setToday((current) => (current.getTime() === now.getTime() ? current : now));
    };
    const msToMidnight = addDays(today, 1).getTime() - Date.now();
    const timer = setTimeout(refresh, Math.max(msToMidnight, 0) + 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [today]);

  return today;
}

const OPEN: TaskFilters = { excludeDone: true, sort: "dueAt", page: 1, pageSize: 100 };

/** Open tasks whose due date was before today. */
export function overdueFilters(today: Date): TaskFilters {
  return { ...OPEN, dueBefore: today.toISOString() };
}

/** Open tasks due at any time today. */
export function dueTodayFilters(today: Date): TaskFilters {
  return { ...OPEN, dueAfter: today.toISOString(), dueBefore: addDays(today, 1).toISOString() };
}

/** Open tasks due from tomorrow through the next UPCOMING_DAYS days. */
export function upcomingFilters(today: Date): TaskFilters {
  return { ...OPEN, dueAfter: addDays(today, 1).toISOString(), dueBefore: addDays(today, 1 + UPCOMING_DAYS).toISOString() };
}
