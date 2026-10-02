import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTodayCount } from "@/features/agenda/useTodayCount";

const linkClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export function MainNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const todayCount = useTodayCount();
  // List and board are two views of the same "All tasks" section.
  const inAllTasks = pathname.startsWith("/tasks") || pathname.startsWith("/board");

  return (
    <nav aria-label={t("nav.label")} className="flex flex-wrap items-center gap-1">
      <NavLink to="/today" className={({ isActive }) => linkClass(isActive)}>
        {t("nav.today")}
        {todayCount > 0 && (
          <span
            className="rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white"
            aria-label={t("nav.todayCount", { count: todayCount })}
          >
            {todayCount}
          </span>
        )}
      </NavLink>
      <NavLink to="/upcoming" className={({ isActive }) => linkClass(isActive)}>
        {t("nav.upcoming")}
      </NavLink>
      <Link to="/tasks" className={linkClass(inAllTasks)} aria-current={inAllTasks ? "page" : undefined}>
        {t("nav.all")}
      </Link>
    </nav>
  );
}
