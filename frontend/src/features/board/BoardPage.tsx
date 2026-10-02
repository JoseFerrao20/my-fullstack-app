import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { BoardColumn } from "@/features/board/BoardColumn";
import { BOARD_COLUMNS, type SharedFilters } from "@/features/board/columns";
import { TaskCard } from "@/features/board/TaskCard";
import { useMoveTask } from "@/features/board/useMoveTask";
import { TaskFilters } from "@/features/tasks/TaskFilters";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ViewToggle } from "@/features/tasks/ViewToggle";
import { useFilterParams } from "@/features/tasks/useFilterParams";
import type { Task, TaskStatus } from "@/lib/types";

export function BoardPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useFilterParams();
  const shared = useMemo<SharedFilters>(
    () => ({ priority: filters.priority, categoryId: filters.categoryId, tag: filters.tag, q: filters.q }),
    [filters.priority, filters.categoryId, filters.tag, filters.q],
  );
  const move = useMoveTask();
  const [dragging, setDragging] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const sensors = useSensors(
    // A small distance lets clicks on the drag handle through without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const moveTask = (task: Task, status: TaskStatus) => {
    if (task.status !== status) move.mutate({ task, status });
  };

  const onDragStart = ({ active }: DragStartEvent) => setDragging((active.data.current?.task as Task) ?? null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = active.data.current?.task as Task | undefined;
    if (task && over) moveTask(task, over.id as TaskStatus);
  };

  // Screen-reader announcements for drag and drop, in the UI language.
  const titleOf = (data: unknown) => ((data as { task?: Task } | undefined)?.task?.title ?? "");
  const columnName = (id: unknown) => t(`task.status.${id as TaskStatus}`);
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("board.dnd.start", { title: titleOf(active.data.current) }),
    onDragOver: ({ over }) => (over ? t("board.dnd.over", { column: columnName(over.id) }) : undefined),
    onDragEnd: ({ active, over }) =>
      over
        ? t("board.dnd.drop", { title: titleOf(active.data.current), column: columnName(over.id) })
        : t("board.dnd.dropNowhere", { title: titleOf(active.data.current) }),
    onDragCancel: ({ active }) => t("board.dnd.cancel", { title: titleOf(active.data.current) }),
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setFormOpen(true);
  };
  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-900">{t("tasks.title")}</h1>
          <ViewToggle filters={filters} />
        </div>
        <Button onClick={openCreate}>{t("tasks.new")}</Button>
      </div>

      <TaskFilters variant="board" value={filters} onChange={setFilters} />

      <DndContext
        sensors={sensors}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t("board.dnd.instructions") } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn key={column.status} column={column} shared={shared} onOpen={openEdit} onMove={moveTask} />
          ))}
        </div>
        <DragOverlay>
          {dragging && <TaskCard task={dragging} onOpen={() => {}} onMove={() => {}} overlay />}
        </DragOverlay>
      </DndContext>

      <TaskFormDialog open={formOpen} task={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
