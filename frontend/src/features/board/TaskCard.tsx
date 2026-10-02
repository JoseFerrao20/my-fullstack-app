import { useDraggable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { SubtaskProgress } from "@/features/subtasks/SubtaskProgress";
import { PRIORITY_STYLES, recurrenceLabel, remindLabel, STATUSES } from "@/features/tasks/schema";
import { formatDueDate, isOverdue } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/types";

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  /** Rendered inside the drag overlay: no drag wiring, no controls. */
  overlay?: boolean;
}

export function TaskCard({ task, onOpen, onMove, overlay = false }: Props) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: overlay,
  });
  const overdue = isOverdue(task);
  const done = task.status === "done";

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      data-testid={`card-${task.id}`}
      className={`flex gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${
        isDragging ? "opacity-40" : ""
      } ${overlay ? "rotate-2 shadow-lg" : ""}`}
    >
      <button
        type="button"
        aria-label={t("board.drag", { title: task.title })}
        className="cursor-grab touch-none self-start rounded px-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        {...(overlay ? {} : { ...attributes, ...listeners })}
      >
        ⋮⋮
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <button
          type="button"
          onClick={() => onOpen(task)}
          className={`block w-full text-left text-sm font-medium hover:underline ${
            done ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {task.title}
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={PRIORITY_STYLES[task.priority]}>{t(`task.priority.${task.priority}`)}</Badge>
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
          <SubtaskProgress subtasks={task.subtasks} />
          {task.category && (
            <Badge className="bg-slate-100 text-slate-700">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: task.category.color }} />
              {task.category.name}
            </Badge>
          )}
        </div>

        {task.dueAt && (
          <p className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
            {t(overdue ? "task.overdue" : "task.due", { date: formatDueDate(task.dueAt) })}
          </p>
        )}

        {!overlay && (
          <select
            aria-label={t("board.moveTo", { title: task.title })}
            value=""
            onChange={(e) => e.target.value && onMove(task, e.target.value as TaskStatus)}
            className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-600"
          >
            <option value="">{t("board.movePlaceholder")}</option>
            {STATUSES.filter((s) => s !== task.status).map((s) => (
              <option key={s} value={s}>
                {t(`task.status.${s}`)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
