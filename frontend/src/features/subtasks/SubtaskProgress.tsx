import { useTranslation } from "react-i18next";
import type { Subtask } from "@/lib/types";

interface Props {
  subtasks: Subtask[];
  /** When given, the badge is a button that shows/hides the checklist. */
  onToggle?: () => void;
  expanded?: boolean;
}

/** "☑ 2/5" with a thin progress bar. Renders nothing for tasks without steps. */
export function SubtaskProgress({ subtasks, onToggle, expanded }: Props) {
  const { t } = useTranslation();
  if (subtasks.length === 0) return null;

  const done = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const label = t("subtasks.progress", { done, total });
  const content = (
    <>
      <span aria-hidden="true">☑</span>
      <span aria-hidden="true">
        {done}/{total}
      </span>
      <span aria-hidden="true" className="h-1 w-8 overflow-hidden rounded-full bg-slate-200">
        <span
          className={`block h-full rounded-full ${done === total ? "bg-emerald-500" : "bg-indigo-500"}`}
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>
    </>
  );
  const className =
    "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700";

  if (!onToggle) {
    return (
      <span className={className} role="img" aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${label}. ${expanded ? t("subtasks.hide") : t("subtasks.show")}`}
      className={`${className} hover:bg-slate-200`}
    >
      {content}
    </button>
  );
}
