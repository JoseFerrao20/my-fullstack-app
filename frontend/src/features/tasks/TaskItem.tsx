import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDeleteTask, useUpdateTask } from "@/features/tasks/hooks";
import { PRIORITY_STYLES, recurrenceLabel, remindLabel } from "@/features/tasks/schema";
import { useErrorMessage } from "@/lib/errors";
import { formatDueDate, isOverdue } from "@/lib/format";
import type { Task } from "@/lib/types";

export function TaskItem({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const toast = useToast();
  const done = task.status === "done";
  const overdue = isOverdue(task);

  const onError = (err: Error) => toast(errorMessage(err), "error");

  return (
    <li className="flex items-start gap-3 rounded-lg bg-white p-4 shadow-sm">
      <input
        type="checkbox"
        checked={done}
        aria-label={done ? t("task.markNotDone", { title: task.title }) : t("task.markDone", { title: task.title })}
        disabled={update.isPending}
        onChange={() => update.mutate({ id: task.id, status: done ? "todo" : "done" }, { onError })}
        className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</h3>
          <Badge className={PRIORITY_STYLES[task.priority]}>{t(`task.priority.${task.priority}`)}</Badge>
          {task.status === "in_progress" && (
            <Badge className="bg-indigo-100 text-indigo-800">{t("task.status.in_progress")}</Badge>
          )}
          {task.recurrence && (
            <Badge className="bg-emerald-100 text-emerald-800">
              <span aria-hidden="true" className="mr-1">↻</span>
              {recurrenceLabel(t, task.recurrence, task.recurrenceInterval)}
            </Badge>
          )}
          {task.remindBeforeMinutes !== null && task.dueAt && task.status !== "done" && (
            <Badge className="bg-amber-50 text-amber-800">
              <span aria-hidden="true" className="mr-1">🔔</span>
              <span className="sr-only">{t("reminders.badge", { when: remindLabel(t, task.remindBeforeMinutes) })}</span>
              <span aria-hidden="true">{remindLabel(t, task.remindBeforeMinutes)}</span>
            </Badge>
          )}
          {task.category && (
            <Badge className="bg-slate-100 text-slate-700">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: task.category.color }} />
              {task.category.name}
            </Badge>
          )}
        </div>
        {task.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{task.description}</p>}
        {task.dueAt && (
          <p className={`mt-1 text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
            {t(overdue ? "task.overdue" : "task.due", { date: formatDueDate(task.dueAt) })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" onClick={() => onEdit(task)} aria-label={t("task.editTitle", { title: task.title })}>
          {t("task.edit")}
        </Button>
        <Button
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
          aria-label={t("task.deleteTitle", { title: task.title })}
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(t("task.confirmDelete", { title: task.title }))) remove.mutate(task.id, { onError });
          }}
        >
          {t("task.delete")}
        </Button>
      </div>
    </li>
  );
}
