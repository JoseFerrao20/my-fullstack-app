import type { TaskFilters } from "@/features/tasks/api";
import { STATUS_LABELS } from "@/features/tasks/schema";
import type { TaskStatus } from "@/lib/types";

export interface BoardColumnConfig {
  status: TaskStatus;
  title: string;
  sort: NonNullable<TaskFilters["sort"]>;
  limit: number;
}

export const BOARD_COLUMNS: BoardColumnConfig[] = [
  { status: "todo", title: STATUS_LABELS.todo, sort: "-priority", limit: 100 },
  { status: "in_progress", title: STATUS_LABELS.in_progress, sort: "-priority", limit: 100 },
  // Done grows forever, so only show the most recently completed.
  { status: "done", title: STATUS_LABELS.done, sort: "-completedAt", limit: 20 },
];

/** Filters shared between the list and the board (status and sort are per column). */
export type SharedFilters = Pick<TaskFilters, "priority" | "categoryId" | "q">;

export function columnFilters(shared: SharedFilters, column: BoardColumnConfig): TaskFilters {
  return { ...shared, status: column.status, sort: column.sort, page: 1, pageSize: column.limit };
}
