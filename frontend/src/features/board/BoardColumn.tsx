import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { columnFilters, type BoardColumnConfig, type SharedFilters } from "@/features/board/columns";
import { TaskCard } from "@/features/board/TaskCard";
import { useTasks } from "@/features/tasks/hooks";
import { filtersToSearch } from "@/features/tasks/useFilterParams";
import type { Task, TaskStatus } from "@/lib/types";

interface Props {
  column: BoardColumnConfig;
  shared: SharedFilters;
  onOpen: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

export function BoardColumn({ column, shared, onOpen, onMove }: Props) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useTasks(columnFilters(shared, column));
  const title = t(`task.status.${column.status}`);
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  const tasks = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const hidden = total - tasks.length;
  const headingId = `column-${column.status}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={`flex min-h-64 flex-col rounded-xl p-3 transition-colors ${
        isOver ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-slate-100"
      }`}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 id={headingId} className="text-sm font-semibold text-slate-700">
          {title}
        </h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600" aria-label={t("board.count", { count: total })}>
          {total}
        </span>
      </header>

      {isPending ? (
        <p className="px-1 text-sm text-slate-500">{t("app.loading")}</p>
      ) : isError ? (
        <p role="alert" className="px-1 text-sm text-red-600">
          {t("board.loadError")}
        </p>
      ) : tasks.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t("board.empty")}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={t("board.columnTasks", { column: title })}>
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} onOpen={onOpen} onMove={onMove} />
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <Link
          to={`/${filtersToSearch({ ...shared, status: column.status, sort: column.sort })}`}
          className="mt-3 px-1 text-sm font-medium text-indigo-600 hover:underline"
        >
          {t("board.more", { count: hidden })}
        </Link>
      )}
    </section>
  );
}
