import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui/Field";
import { CategorySelect } from "@/features/categories/CategorySelect";
import type { TaskFilters as Filters, TaskSort } from "@/features/tasks/api";
import { PRIORITIES, STATUSES } from "@/features/tasks/schema";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const SORTS: TaskSort[] = ["-createdAt", "createdAt", "dueAt", "-dueAt", "-priority", "priority", "title", "-completedAt"];

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
  /** The board shows statuses as columns and sorts each column itself. */
  variant?: "list" | "board";
}

export function TaskFilters({ value, onChange, variant = "list" }: Props) {
  const { t } = useTranslation();
  const isList = variant === "list";
  const [search, setSearch] = useState(value.q ?? "");

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === (value.q ?? "")) return;
    const id = setTimeout(() => onChange({ ...value, q: trimmed || undefined, page: 1 }), 300);
    return () => clearTimeout(id);
  }, [search, value, onChange]);

  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch, page: 1 });

  return (
    <div className={`grid grid-cols-2 gap-3 rounded-lg bg-white p-4 shadow-sm ${isList ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
      <div className="col-span-2 md:col-span-1">
        <label htmlFor="task-search" className="block text-sm font-medium text-slate-700">
          {t("filters.search")}
        </label>
        <input
          id="task-search"
          type="search"
          value={search}
          placeholder={t("filters.searchPlaceholder")}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      {isList && (
        <Select
          label={t("filters.status")}
          value={value.status ?? ""}
          onChange={(e) => set({ status: (e.target.value || undefined) as TaskStatus | undefined })}
        >
          <option value="">{t("filters.all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`task.status.${s}`)}
            </option>
          ))}
        </Select>
      )}
      <Select
        label={t("filters.priority")}
        value={value.priority ?? ""}
        onChange={(e) => set({ priority: (e.target.value || undefined) as TaskPriority | undefined })}
      >
        <option value="">{t("filters.all")}</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {t(`task.priority.${p}`)}
          </option>
        ))}
      </Select>
      <CategorySelect
        label={t("filters.category")}
        emptyLabel={t("filters.all")}
        value={value.categoryId ?? ""}
        onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : undefined })}
      />
      {isList && (
        <Select
          label={t("filters.sort")}
          value={value.sort ?? "-createdAt"}
          onChange={(e) => set({ sort: e.target.value as TaskSort })}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`filters.sortBy.${s}`)}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
