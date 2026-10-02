import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useToday } from "@/features/agenda/dates";
import { CalendarDay, CalendarTask } from "@/features/calendar/CalendarParts";
import {
  addDays,
  addMonths,
  dayKey,
  moveToDay,
  parseDayKey,
  startOfDay,
  visibleDays,
  type CalendarView,
} from "@/features/calendar/dates";
import { useRescheduleTask } from "@/features/calendar/useRescheduleTask";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { useTasks } from "@/features/tasks/hooks";
import type { TaskFormValues } from "@/features/tasks/schema";
import { useErrorMessage } from "@/lib/errors";
import { intlLocale } from "@/lib/i18n";
import type { Task } from "@/lib/types";

const MONTH_CELL_LIMIT = 3;
const PAGE_SIZE = 500;

export function CalendarPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const view: CalendarView = params.get("view") === "week" ? "week" : "month";
  const anchor = parseDayKey(params.get("date")) ?? today;

  // anchor is a new Date each render; depend on its value.
  const anchorTime = anchor.getTime();
  const days = useMemo(() => visibleDays(view, new Date(anchorTime)), [view, anchorTime]);
  const range = { start: days[0], end: addDays(days[days.length - 1], 1) };
  const { data, isPending, error } = useTasks({
    dueAfter: range.start.toISOString(),
    dueBefore: range.end.toISOString(),
    sort: "dueAt",
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of data?.data ?? []) {
      if (!task.dueAt) continue;
      const key = dayKey(new Date(task.dueAt));
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [data]);

  const go = (nextView: CalendarView, date: Date) => {
    const next = new URLSearchParams();
    if (nextView === "week") next.set("view", "week");
    if (dayKey(date) !== dayKey(today)) next.set("date", dayKey(date));
    setParams(next);
  };
  const step = (direction: -1 | 1) =>
    go(view, view === "month" ? addMonths(anchor, direction) : addDays(anchor, 7 * direction));

  // Task dialog: open an existing task, or start one on a given day at 09:00.
  const [editing, setEditing] = useState<Task | null>(null);
  const [initialValues, setInitialValues] = useState<Partial<TaskFormValues>>({});
  const [formOpen, setFormOpen] = useState(false);
  const openTask = (task: Task) => {
    setEditing(task);
    setFormOpen(true);
  };
  const newOnDay = (day: Date) => {
    setEditing(null);
    setInitialValues({ dueAt: `${dayKey(day)}T09:00` });
    setFormOpen(true);
  };

  // Drag a task to another day (pointer and touch).
  const reschedule = useRescheduleTask();
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = active.data.current?.task as Task | undefined;
    const day = over?.data.current?.day as Date | undefined;
    if (!task?.dueAt || !day) return;
    const from = new Date(task.dueAt);
    if (startOfDay(from).getTime() === day.getTime()) return;
    reschedule.mutate({ task, dueAt: moveToDay(from, day) });
  };
  const dateName = (id: unknown) =>
    parseDayKey(String(id))?.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long" }) ?? "";
  const titleOf = (data: unknown) => (data as { task?: Task } | undefined)?.task?.title ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("calendar.dnd.start", { title: titleOf(active.data.current) }),
    onDragOver: ({ over }) => (over ? t("calendar.dnd.over", { date: dateName(over.id) }) : undefined),
    onDragEnd: ({ active, over }) =>
      over
        ? t("calendar.dnd.drop", { title: titleOf(active.data.current), date: dateName(over.id) })
        : t("calendar.dnd.dropNowhere", { title: titleOf(active.data.current) }),
    onDragCancel: ({ active }) => t("calendar.dnd.cancel", { title: titleOf(active.data.current) }),
  };

  const locale = intlLocale();
  const heading =
    view === "month"
      ? anchor.toLocaleDateString(locale, { month: "long", year: "numeric" })
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).formatRange(
          days[0],
          days[6],
        );
  // Jan 1 2024 was a Monday: the 7 weekday names in our Monday-first order.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: view === "week" ? "long" : "short" }),
  );
  const total = data?.meta.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold capitalize text-slate-900">{heading}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-200 p-0.5" role="group" aria-label={t("tasks.view")}>
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => go(v, anchor)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t(`calendar.${v}`)}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            aria-label={view === "month" ? t("calendar.previousMonth") : t("calendar.previousWeek")}
            onClick={() => step(-1)}
          >
            ‹
          </Button>
          <Button variant="secondary" onClick={() => go(view, today)}>
            {t("calendar.today")}
          </Button>
          <Button
            variant="secondary"
            aria-label={view === "month" ? t("calendar.nextMonth") : t("calendar.nextWeek")}
            onClick={() => step(1)}
          >
            ›
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-red-600">
          {t("tasks.loadError", { message: errorMessage(error) })}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          accessibility={{ announcements, screenReaderInstructions: { draggable: t("calendar.dnd.instructions") } }}
          onDragStart={({ active }) => setDragging((active.data.current?.task as Task) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className={`overflow-hidden rounded-lg border border-slate-200 ${isPending ? "opacity-60" : ""}`}>
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {weekdays.map((name, i) => (
                <div key={name} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {view === "week" ? `${name} ${days[i].getDate()}` : name}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
              {days.map((day) => (
                <CalendarDay
                  key={dayKey(day)}
                  day={day}
                  today={today}
                  tasks={byDay.get(dayKey(day)) ?? []}
                  outside={view === "month" && day.getMonth() !== anchor.getMonth()}
                  limit={view === "month" ? MONTH_CELL_LIMIT : undefined}
                  tall={view === "week"}
                  onOpen={openTask}
                  onNew={newOnDay}
                  onMore={(d) => go("week", d)}
                />
              ))}
            </div>
          </div>
          <DragOverlay>{dragging && <CalendarTask task={dragging} onOpen={() => {}} overlay />}</DragOverlay>
        </DndContext>
      )}

      {total > PAGE_SIZE && (
        <p className="text-sm text-amber-700">{t("calendar.tooMany", { shown: PAGE_SIZE, total })}</p>
      )}
      <p className="text-xs text-slate-500">{t("calendar.recurringNote")}</p>

      <TaskFormDialog open={formOpen} task={editing} initialValues={initialValues} onClose={() => setFormOpen(false)} />
    </div>
  );
}
