import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { CategoriesManager } from "@/features/categories/CategoriesManager";
import type { TaskFilters as Filters, TaskSort } from "@/features/tasks/api";
import { TaskFilters } from "@/features/tasks/TaskFilters";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { TaskItem } from "@/features/tasks/TaskItem";
import { useTasks } from "@/features/tasks/hooks";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

const PAGE_SIZE = 20;

/** Filters live in the URL so they survive reloads and can be shared. */
function useFilterParams(): [Filters, (next: Filters) => void] {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<Filters>(
    () => ({
      status: (params.get("status") as TaskStatus) || undefined,
      priority: (params.get("priority") as TaskPriority) || undefined,
      categoryId: params.get("categoryId") ? Number(params.get("categoryId")) : undefined,
      q: params.get("q") || undefined,
      sort: (params.get("sort") as TaskSort) || "-createdAt",
      page: Number(params.get("page")) || 1,
      pageSize: PAGE_SIZE,
    }),
    [params],
  );

  const setFilters = useCallback(
    (next: Filters) => {
      const out = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (key === "pageSize" || value === undefined || value === "") continue;
        if (key === "sort" && value === "-createdAt") continue;
        if (key === "page" && value === 1) continue;
        out.set(key, String(value));
      }
      setParams(out, { replace: true });
    },
    [setParams],
  );

  return [filters, setFilters];
}

export function TasksPage() {
  const [filters, setFilters] = useFilterParams();
  const { data, isPending, isError, error, isPlaceholderData } = useTasks(filters);
  const [editing, setEditing] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const tasks = data?.data ?? [];
  const meta = data?.meta;
  const page = filters.page ?? 1;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const hasFilters = Boolean(filters.status || filters.priority || filters.categoryId || filters.q);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setFormOpen(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <Button onClick={openCreate}>+ New task</Button>
        </div>

        <TaskFilters value={filters} onChange={setFilters} />

        {isPending ? (
          <p className="text-slate-500">Loading tasks…</p>
        ) : isError ? (
          <p role="alert" className="text-red-600">
            Couldn't load tasks: {error.message}
          </p>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
            {hasFilters ? "No tasks match these filters." : "No tasks yet. Create your first one!"}
          </div>
        ) : (
          <ul className={`space-y-2 ${isPlaceholderData ? "opacity-60" : ""}`} aria-label="Tasks">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} onEdit={openEdit} />
            ))}
          </ul>
        )}

        {meta && meta.total > meta.pageSize && (
          <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setFilters({ ...filters, page: page - 1 })}>
              Previous
            </Button>
            <span className="text-slate-600">
              Page {page} of {totalPages} · {meta.total} tasks
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setFilters({ ...filters, page: page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </div>

      <aside>
        <CategoriesManager />
      </aside>

      <TaskFormDialog open={formOpen} task={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
