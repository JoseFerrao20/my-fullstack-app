import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { TaskFilters, TaskSort } from "@/features/tasks/api";
import type { TaskPriority, TaskStatus } from "@/lib/types";

export const PAGE_SIZE = 20;
const DEFAULT_SORT: TaskSort = "-createdAt";

/** Filters -> URL query string (defaults and pageSize are left out). Returns "" or "?…". */
export function filtersToSearch(filters: TaskFilters): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "pageSize" || value === undefined || value === "") continue;
    if (key === "sort" && value === DEFAULT_SORT) continue;
    if (key === "page" && value === 1) continue;
    out.set(key, String(value));
  }
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

/** Filters live in the URL so they survive reloads, can be shared, and carry over between list and board. */
export function useFilterParams(): [TaskFilters, (next: TaskFilters) => void] {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<TaskFilters>(
    () => ({
      status: (params.get("status") as TaskStatus) || undefined,
      priority: (params.get("priority") as TaskPriority) || undefined,
      categoryId: params.get("categoryId") ? Number(params.get("categoryId")) : undefined,
      q: params.get("q") || undefined,
      sort: (params.get("sort") as TaskSort) || DEFAULT_SORT,
      page: Number(params.get("page")) || 1,
      pageSize: PAGE_SIZE,
    }),
    [params],
  );

  const setFilters = useCallback(
    (next: TaskFilters) => setParams(new URLSearchParams(filtersToSearch(next)), { replace: true }),
    [setParams],
  );

  return [filters, setFilters];
}
