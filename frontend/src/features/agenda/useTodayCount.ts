import { dueTodayFilters, overdueFilters, useToday } from "@/features/agenda/dates";
import { useTasks } from "@/features/tasks/hooks";

/** Overdue + due-today open tasks, for the nav badge. Shares its cache with TodayPage. */
export function useTodayCount(): number {
  const today = useToday();
  const overdue = useTasks(overdueFilters(today));
  const dueToday = useTasks(dueTodayFilters(today));
  return (overdue.data?.meta.total ?? 0) + (dueToday.data?.meta.total ?? 0);
}
