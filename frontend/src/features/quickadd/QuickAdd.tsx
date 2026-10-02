import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { categoriesApi } from "@/features/categories/api";
import { categoriesKey, useCategories } from "@/features/categories/hooks";
import { foldForMatch, parseQuickAdd, type ParsedTask } from "@/features/quickadd/parse";
import type { TaskInput } from "@/features/tasks/api";
import { useCreateTask } from "@/features/tasks/hooks";
import { browserTimeZone, PRIORITY_STYLES, recurrenceLabel, type TaskFormValues } from "@/features/tasks/schema";
import { ApiError } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import { formatDueDate, toDateTimeLocal } from "@/lib/format";
import type { Category } from "@/lib/types";

const NEW_CATEGORY_COLOR = "#6366f1";

/** Finds the typed #category (accent/case-insensitive) or creates it. */
function useResolveCategory() {
  const { data: categories = [] } = useCategories();
  const queryClient = useQueryClient();

  const existing = (name: string | null): Category | undefined =>
    name ? categories.find((c) => foldForMatch(c.name) === foldForMatch(name)) : undefined;

  const resolve = async (name: string | null): Promise<number | null> => {
    if (!name) return null;
    const found = existing(name);
    if (found) return found.id;
    try {
      const created = await categoriesApi.create({ name, color: NEW_CATEGORY_COLOR });
      await queryClient.invalidateQueries({ queryKey: categoriesKey });
      return created.id;
    } catch (err) {
      // Created meanwhile (another tab): use that one.
      if (err instanceof ApiError && err.code === "CATEGORY_EXISTS") {
        const fresh = await queryClient.fetchQuery({ queryKey: categoriesKey, queryFn: categoriesApi.list });
        const match = fresh.find((c) => foldForMatch(c.name) === foldForMatch(name));
        if (match) return match.id;
      }
      throw err;
    }
  };

  return { existing, resolve };
}

function toInput(parsed: ParsedTask, categoryId: number | null): TaskInput {
  return {
    title: parsed.title,
    description: null,
    status: "todo",
    priority: parsed.priority ?? "medium",
    dueAt: parsed.dueAt ? parsed.dueAt.toISOString() : null,
    categoryId,
    recurrence: parsed.recurrence,
    recurrenceInterval: parsed.recurrenceInterval,
    recurrenceTimezone: parsed.recurrence ? browserTimeZone() : null,
    remindBeforeMinutes: null,
    tags: parsed.tags,
  };
}

interface Props {
  /** Opens the full task form with what was typed so far. */
  onOpenDetails: (values: Partial<TaskFormValues>) => void;
}

export function QuickAdd({ onOpenDetails }: Props) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const create = useCreateTask();
  const { existing, resolve } = useResolveCategory();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = text.trim() ? parseQuickAdd(text) : null;
  const isNewCategory = Boolean(parsed?.category && !existing(parsed.category));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!parsed || busy) return;
    if (!parsed.title) {
      setError(t("quickAdd.needsTitle"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const categoryId = await resolve(parsed.category);
      await create.mutateAsync(toInput(parsed, categoryId));
      toast(t("quickAdd.added", { title: parsed.title }));
      setText("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openDetails = async () => {
    if (!parsed) return onOpenDetails({});
    try {
      const categoryId = await resolve(parsed.category);
      onOpenDetails({
        title: parsed.title,
        priority: parsed.priority ?? "medium",
        dueAt: parsed.dueAt ? toDateTimeLocal(parsed.dueAt.toISOString()) : "",
        categoryId: categoryId === null ? "" : String(categoryId),
        recurrence: parsed.recurrence ?? "",
        recurrenceInterval: String(parsed.recurrenceInterval),
        tags: parsed.tags,
      });
      setText("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setText("");
      setError(null);
    }
  };

  const chips: { key: string; label: string; className: string }[] = [];
  if (parsed?.dueAt) chips.push({ key: "due", label: `📅 ${formatDueDate(parsed.dueAt.toISOString())}`, className: "bg-sky-50 text-sky-800" });
  if (parsed?.recurrence)
    chips.push({ key: "repeat", label: `↻ ${recurrenceLabel(t, parsed.recurrence, parsed.recurrenceInterval)}`, className: "bg-emerald-50 text-emerald-800" });
  if (parsed?.category)
    chips.push({
      key: "category",
      label: isNewCategory ? t("quickAdd.newCategory", { name: parsed.category }) : `#${existing(parsed.category)?.name}`,
      className: "bg-slate-100 text-slate-700",
    });
  for (const tag of parsed?.tags ?? []) chips.push({ key: `tag-${tag}`, label: `@${tag}`, className: "border border-slate-300 text-slate-600" });
  if (parsed?.priority)
    chips.push({ key: "priority", label: `! ${t(`task.priority.${parsed.priority}`)}`, className: PRIORITY_STYLES[parsed.priority] });

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          aria-label={t("quickAdd.label")}
          aria-describedby="quick-add-hint"
          placeholder={t("quickAdd.placeholder")}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          disabled={busy}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <Button variant="ghost" onClick={openDetails} disabled={busy}>
          {t("quickAdd.details")}
        </Button>
      </div>
      {parsed && (chips.length > 0 || parsed.title) && (
        <div aria-live="polite" className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">{t("quickAdd.understood")}:</span>
          {parsed.title && <span className="font-medium text-slate-900">“{parsed.title}”</span>}
          {chips.map((chip) => (
            <span key={chip.key} data-testid={`chip-${chip.key}`} className={`rounded-full px-2 py-0.5 font-medium ${chip.className}`}>
              {chip.label}
            </span>
          ))}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p id="quick-add-hint" className="text-xs text-slate-400">
          {t("quickAdd.hint")}
        </p>
      )}
    </form>
  );
}
