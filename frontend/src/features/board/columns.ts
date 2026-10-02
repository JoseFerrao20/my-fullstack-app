import type { TaskFilters } from "@/features/tasks/api";
import type { TaskStatus } from "@/lib/types";

export interface BoardColumnConfig {
  status: TaskStatus;
  sort: NonNullable<TaskFilters["sort"]>;
  limit: number;
}

export const BOARD_COLUMNS: BoardColumnConfig[] = [
  { status: "todo", sort: "-priority", limit: 100 },
  { status: "in_progress", sort: "-priority", limit: 100 },
  // Done grows forever, so only show the most recently completed.
  { status: "done", sort: "-completedAt", limit: 20 },
];

/** Filters shared between the list and the board (status and sort are per column). */
export type SharedFilters = Pick<TaskFilters, "priority" | "categoryId" | "tag" | "q">;

export function columnFilters(shared: SharedFilters, column: BoardColumnConfig): TaskFilters {
  return { ...shared, status: column.status, sort: column.sort, page: 1, pageSize: column.limit };
}
