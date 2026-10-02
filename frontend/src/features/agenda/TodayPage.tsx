import { useTranslation } from "react-i18next";
import { AgendaPage, TaskGroup } from "@/features/agenda/AgendaPage";
import { dueTodayFilters, overdueFilters, useToday } from "@/features/agenda/dates";
import { useTasks } from "@/features/tasks/hooks";
import { useErrorMessage } from "@/lib/errors";
import { intlLocale } from "@/lib/i18n";

/** Open tasks due today, plus everything still overdue. The home page. */
export function TodayPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const today = useToday();
  const overdue = useTasks(overdueFilters(today));
  const dueToday = useTasks(dueTodayFilters(today));

  const date = today.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long" });
  const error = overdue.error ?? dueToday.error;

  return (
    <AgendaPage title={t("agenda.today")} subtitle={date}>
      {(openEdit) =>
        overdue.isPending || dueToday.isPending ? (
          <p className="text-slate-500">{t("tasks.loading")}</p>
        ) : error ? (
          <p role="alert" className="text-red-600">
            {t("tasks.loadError", { message: errorMessage(error) })}
          </p>
        ) : (
          <>
            <TaskGroup title={t("agenda.overdue")} tone="danger" tasks={overdue.data?.data ?? []} onEdit={openEdit} />
            <TaskGroup
              title={t("agenda.dueToday")}
              tasks={dueToday.data?.data ?? []}
              onEdit={openEdit}
              empty={t("agenda.todayEmpty")}
            />
          </>
        )
      }
    </AgendaPage>
  );
}
