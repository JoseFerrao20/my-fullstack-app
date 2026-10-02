import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CategoriesManager } from "@/features/categories/CategoriesManager";
import { TaskFilters } from "@/features/tasks/TaskFilters";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { TaskItem } from "@/features/tasks/TaskItem";
import { ViewToggle } from "@/features/tasks/ViewToggle";
import { useTasks } from "@/features/tasks/hooks";
import { useFilterParams } from "@/features/tasks/useFilterParams";
import type { Task } from "@/lib/types";

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
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
            <ViewToggle filters={filters} />
          </div>
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
