import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { dayKey } from "@/features/calendar/dates";
import { intlLocale } from "@/lib/i18n";
import type { Task, TaskPriority } from "@/lib/types";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
};

function timeLabel(iso: string): string | null {
  const d = new Date(iso);
  // 23:59 is "sometime that day" (see quick add): don't show it as a time.
  if (d.getHours() === 23 && d.getMinutes() === 59) return null;
  return d.toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" });
}

/** One task in the calendar: click to open, drag (pointer/touch) to another day. */
export function CalendarTask({ task, onOpen, overlay = false }: { task: Task; onOpen: (t: Task) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task }, disabled: overlay });
  const done = task.status === "done";
  const time = task.dueAt ? timeLabel(task.dueAt) : null;
  // Only the pointer listeners: keyboard activation stays a normal click (opens the task).
  const { role: _role, tabIndex: _tabIndex, ...dragAttributes } = attributes;

  return (
    <button
      type="button"
      ref={overlay ? undefined : setNodeRef}
      onClick={() => onOpen(task)}
      // Explicit name so the time and title are read as two words, not "09:00Dentist".
      aria-label={time ? `${time}, ${task.title}` : task.title}
      {...(overlay ? {} : { ...dragAttributes, ...listeners })}
      className={`flex w-full touch-none items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs hover:bg-indigo-50 ${
        isDragging ? "opacity-40" : ""
      } ${overlay ? "bg-white shadow-lg" : ""}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
      {time && <span className="shrink-0 tabular-nums text-slate-500">{time}</span>}
      <span className={`truncate ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span>
    </button>
  );
}

interface DayProps {
  day: Date;
  tasks: Task[];
  today: Date;
  /** Month view: days outside the shown month are muted. */
  outside?: boolean;
  /** Month view shows at most this many tasks, then "+N more". */
  limit?: number;
  onOpen: (task: Task) => void;
  onNew: (day: Date) => void;
  onMore?: (day: Date) => void;
  tall?: boolean;
}

export function CalendarDay({ day, tasks, today, outside = false, limit, onOpen, onNew, onMore, tall = false }: DayProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day), data: { day } });
  const isToday = day.getTime() === today.getTime();
  const shown = limit ? tasks.slice(0, limit) : tasks;
  const hidden = tasks.length - shown.length;
  const longDate = day.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={t("calendar.dayTasks", { date: longDate, count: tasks.length })}
      className={`group flex flex-col gap-0.5 border-slate-200 p-1 ${tall ? "min-h-64" : "min-h-24"} ${
        isOver ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : outside ? "bg-slate-50" : "bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${
            isToday ? "bg-indigo-600 text-white" : outside ? "text-slate-400" : "text-slate-700"
          }`}
        >
          {day.getDate()}
        </span>
        <button
          type="button"
          onClick={() => onNew(day)}
          aria-label={t("calendar.newOnDay", { date: longDate })}
          className="rounded px-1 text-sm leading-none text-slate-400 opacity-0 hover:bg-slate-100 hover:text-indigo-600 focus:opacity-100 group-hover:opacity-100"
        >
          +
        </button>
      </div>
      {shown.map((task) => (
        <CalendarTask key={task.id} task={task} onOpen={onOpen} />
      ))}
      {hidden > 0 && onMore && (
        <button
          type="button"
          onClick={() => onMore(day)}
          className="px-1.5 text-left text-xs font-medium text-indigo-600 hover:underline"
        >
          {t("calendar.more", { count: hidden })}
        </button>
      )}
    </div>
  );
}
