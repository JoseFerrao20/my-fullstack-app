import { useTranslation } from "react-i18next";
import { useToggleSubtask } from "@/features/subtasks/hooks";
import type { Task } from "@/lib/types";

/** Tick steps straight from a task list, without opening the task. */
export function QuickChecklist({ task }: { task: Task }) {
  const { t } = useTranslation();
  const toggle = useToggleSubtask(task.id);

  return (
    <ul className="mt-2 space-y-1" aria-label={t("subtasks.title")}>
      {task.subtasks.map((step) => (
        <li key={step.id}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={step.done}
              onChange={(e) => toggle.mutate({ id: step.id, done: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
            />
            <span className={step.done ? "text-slate-400 line-through" : "text-slate-700"}>{step.title}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
