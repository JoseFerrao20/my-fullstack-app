import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import {
  useAddSubtask,
  useDeleteSubtask,
  useRenameSubtask,
  useReorderSubtasks,
  useSubtasks,
  useToggleSubtask,
} from "@/features/subtasks/hooks";

const MAX_STEPS = 50;

interface Row {
  key: string | number;
  title: string;
  done?: boolean;
}

/** Shared layout: one row per step with optional checkbox, editable title, ↑ ↓ and ✕. */
function StepList({
  rows,
  onToggle,
  onRename,
  onMove,
  onDelete,
  onAdd,
  busy,
}: {
  rows: Row[];
  onToggle?: (index: number, done: boolean) => void;
  onRename: (index: number, title: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onDelete: (index: number) => void;
  onAdd: (title: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  const add = () => {
    const title = draft.trim();
    if (!title || rows.length >= MAX_STEPS) return;
    onAdd(title);
    setDraft("");
  };
  // The editor sits inside the task <form>: Enter adds a step instead of submitting it.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">{t("subtasks.title")}</legend>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">{t("subtasks.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-center gap-1.5">
              {onToggle && (
                <input
                  type="checkbox"
                  checked={row.done ?? false}
                  aria-label={row.title}
                  onChange={(e) => onToggle(i, e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                />
              )}
              <StepTitle title={row.title} done={row.done} onRename={(title) => onRename(i, title)} />
              <button
                type="button"
                disabled={i === 0}
                onClick={() => onMove(i, -1)}
                aria-label={t("subtasks.moveUp", { title: row.title })}
                className="rounded px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === rows.length - 1}
                onClick={() => onMove(i, 1)}
                aria-label={t("subtasks.moveDown", { title: row.title })}
                className="rounded px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onDelete(i)}
                aria-label={t("subtasks.delete", { title: row.title })}
                className="rounded px-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length < MAX_STEPS && (
        <div className="flex gap-2">
          <input
            value={draft}
            maxLength={200}
            placeholder={t("subtasks.addPlaceholder")}
            aria-label={t("subtasks.addPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <Button variant="secondary" onClick={add} disabled={!draft.trim() || busy}>
            {t("subtasks.add")}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** Title input that commits on blur (or Enter); blank reverts. */
function StepTitle({ title, done, onRename }: { title: string; done?: boolean; onRename: (title: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(title);
  const commit = () => {
    const next = value.trim();
    if (!next) setValue(title);
    else if (next !== title) onRename(next);
  };
  return (
    <input
      value={value}
      maxLength={200}
      aria-label={t("subtasks.rename", { title })}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={`min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-300 focus:border-indigo-500 focus:outline-none ${
        done ? "text-slate-400 line-through" : "text-slate-800"
      }`}
    />
  );
}

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

/** Editing an existing task: every change is saved right away. */
export function LiveChecklistEditor({ taskId }: { taskId: number }) {
  const { data: steps = [] } = useSubtasks(taskId);
  const add = useAddSubtask(taskId);
  const rename = useRenameSubtask(taskId);
  const remove = useDeleteSubtask(taskId);
  const reorder = useReorderSubtasks(taskId);
  const toggle = useToggleSubtask(taskId);

  return (
    <StepList
      rows={steps.map((s) => ({ key: `${s.id}-${s.title}`, title: s.title, done: s.done }))}
      onToggle={(i, done) => toggle.mutate({ id: steps[i].id, done })}
      onRename={(i, title) => rename.mutate({ id: steps[i].id, title })}
      onMove={(i, delta) => reorder.mutate(move(steps, i, delta).map((s) => s.id))}
      onDelete={(i) => remove.mutate(steps[i].id)}
      onAdd={(title) => add.mutate(title)}
      busy={add.isPending}
    />
  );
}

/** Creating a task: steps are kept here and saved after the task exists. */
export function DraftChecklistEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  return (
    <StepList
      rows={steps.map((title, i) => ({ key: `${i}-${title}`, title }))}
      onRename={(i, title) => onChange(steps.map((s, j) => (j === i ? title : s)))}
      onMove={(i, delta) => onChange(move(steps, i, delta))}
      onDelete={(i) => onChange(steps.filter((_, j) => j !== i))}
      onAdd={(title) => onChange([...steps, title])}
    />
  );
}
