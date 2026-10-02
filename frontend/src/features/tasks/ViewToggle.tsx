import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import type { TaskFilters } from "@/features/tasks/api";
import { filtersToSearch } from "@/features/tasks/useFilterParams";

/** List / Board switch. Carries over the filters both views share (priority, category, search). */
export function ViewToggle({ filters }: { filters: TaskFilters }) {
  const { t } = useTranslation();
  const search = filtersToSearch({ priority: filters.priority, categoryId: filters.categoryId, q: filters.q });
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1 text-sm font-medium ${
      isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <nav aria-label={t("tasks.view")} className="flex rounded-lg bg-slate-200 p-0.5">
      <NavLink to={`/${search}`} end className={linkClass}>
        {t("tasks.list")}
      </NavLink>
      <NavLink to={`/board${search}`} className={linkClass}>
        {t("tasks.board")}
      </NavLink>
    </nav>
  );
}
