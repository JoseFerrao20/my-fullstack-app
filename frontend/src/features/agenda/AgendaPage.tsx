import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { QuickAdd } from "@/features/quickadd/QuickAdd";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { TaskItem } from "@/features/tasks/TaskItem";
import type { TaskFormValues } from "@/features/tasks/schema";
import type { Task } from "@/lib/types";

/** Shared page frame for Today / Upcoming: title, "+ New task" and the edit dialog. */
export function AgendaPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (openEdit: (task: Task) => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [initialValues, setInitialValues] = useState<Partial<TaskFormValues>>({});

  const open = (task: Task | null, values: Partial<TaskFormValues> = {}) => {
    setEditing(task);
    setInitialValues(values);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Button onClick={() => open(null)}>{t("tasks.new")}</Button>
      </div>
      <QuickAdd onOpenDetails={(values) => open(null, values)} />
      {children(open)}
      <TaskFormDialog open={formOpen} task={editing} initialValues={initialValues} onClose={() => setFormOpen(false)} />
    </div>
  );
}

/** A titled group of tasks; renders nothing when empty unless `empty` text is given. */
export function TaskGroup({
  title,
  tasks,
  onEdit,
  tone = "default",
  empty,
}: {
  title: string;
  tasks: Task[];
  onEdit: (task: Task) => void;
  tone?: "default" | "danger";
  empty?: string;
}) {
  if (tasks.length === 0 && !empty) return null;
  const id = `group-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2
        id={id}
        className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${
          tone === "danger" ? "text-red-600" : "text-slate-500"
        }`}
      >
        {title}
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2" aria-label={title}>
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} onEdit={onEdit} />
          ))}
        </ul>
      )}
    </section>
  );
}
