import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useDeleteForever, useEmptyTrash, useRestoreTask, useTrash } from "@/features/tasks/hooks";
import { useErrorMessage } from "@/lib/errors";
import { formatDueDate } from "@/lib/format";

export function TrashPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data: tasks = [], isPending, error } = useTrash();
  const restore = useRestoreTask();
  const deleteForever = useDeleteForever();
  const empty = useEmptyTrash();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("trash.title")}</h1>
          <p className="text-sm text-slate-500">{t("trash.intro")}</p>
        </div>
        {tasks.length > 0 && (
          <Button
            variant="danger"
            disabled={empty.isPending}
            onClick={() => confirm(t("trash.confirmEmpty")) && empty.mutate()}
          >
            {t("trash.emptyTrash")}
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="text-slate-500">{t("app.loading")}</p>
      ) : error ? (
        <p role="alert" className="text-red-600">
          {errorMessage(error)}
        </p>
      ) : tasks.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">{t("trash.empty")}</p>
      ) : (
        <ul className="space-y-2" aria-label={t("trash.title")}>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700">{task.title}</p>
                {task.deletedAt && (
                  <p className="text-xs text-slate-500">{t("trash.deletedOn", { date: formatDueDate(task.deletedAt) })}</p>
                )}
              </div>
              <Button variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(task)}>
                {t("trash.restore")}
              </Button>
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                disabled={deleteForever.isPending}
                onClick={() => confirm(t("trash.confirmDeleteForever", { title: task.title })) && deleteForever.mutate(task.id)}
              >
                {t("trash.deleteForever")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
