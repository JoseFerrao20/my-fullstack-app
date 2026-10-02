import { useTranslation } from "react-i18next";
import { AgendaPage, TaskGroup } from "@/features/agenda/AgendaPage";
import { addDays, dayKey, UPCOMING_DAYS, upcomingFilters, useToday } from "@/features/agenda/dates";
import { useTasks } from "@/features/tasks/hooks";
import { useErrorMessage } from "@/lib/errors";
import { intlLocale } from "@/lib/i18n";
import type { Task } from "@/lib/types";

/** Open tasks due in the next 7 days (after today), grouped by day. */
export function UpcomingPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const today = useToday();
  const { data, isPending, error } = useTasks(upcomingFilters(today));

  const byDay = new Map<string, Task[]>();
  for (const task of data?.data ?? []) {
    const key = dayKey(new Date(task.dueAt!));
    byDay.set(key, [...(byDay.get(key) ?? []), task]);
  }
  const days = Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(today, i + 1));
  const label = (day: Date, index: number) => {
    const date = day.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long" });
    return index === 0 ? `${t("agenda.tomorrow")} · ${date}` : date;
  };

  return (
    <AgendaPage title={t("agenda.upcoming")}>
      {(openEdit) =>
        isPending ? (
          <p className="text-slate-500">{t("tasks.loading")}</p>
        ) : error ? (
          <p role="alert" className="text-red-600">
            {t("tasks.loadError", { message: errorMessage(error) })}
          </p>
        ) : byDay.size === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
            {t("agenda.upcomingEmpty")}
          </p>
        ) : (
          days.map((day, i) => (
            <TaskGroup key={dayKey(day)} title={label(day, i)} tasks={byDay.get(dayKey(day)) ?? []} onEdit={openEdit} />
          ))
        )
      }
    </AgendaPage>
  );
}
