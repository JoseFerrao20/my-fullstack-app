/**
 * Quick-add parser: "Pagar renda dia 1 todos os meses #casa !alta" → title, due date,
 * recurrence, category and priority. Understands Portuguese and English at once,
 * with or without accents. Pure function; "now" is passed in so it's testable.
 */
import type { TaskPriority, TaskRecurrence } from "@/lib/types";

export interface ParsedTask {
  title: string;
  dueAt: Date | null;
  /** Whether the text named a time ("às 9h"); otherwise the due time is end of day. */
  hasTime: boolean;
  recurrence: TaskRecurrence | null;
  recurrenceInterval: number;
  priority: TaskPriority | null;
  /** Category as typed after "#", without the "#". */
  category: string | null;
  /** Tags typed as "@name", in order. */
  tags: string[];
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7,
  setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
  jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, jun: 5, jul: 6, ago: 7, aug: 7,
  set: 8, sep: 8, sept: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11,
};

const PRIORITIES: Record<string, TaskPriority> = {
  urgente: "urgent", urgent: "urgent",
  alta: "high", high: "high",
  media: "medium", medium: "medium",
  baixa: "low", low: "low",
};

const UNIT = String.raw`(dias?|days?|semanas?|weeks?|mes(?:es)?|months?)`;
const WEEKDAY = String.raw`(segunda|terca|quarta|quinta|sexta|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;
const MONTH = `(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|")})`;
// Month-first ("June 5") is the English order; skip "set"/"out" there, which are common
// English words ("Set 3 alarms") and only Portuguese month abbreviations (written day-first).
const MONTH_FIRST = `(${Object.keys(MONTHS).filter((m) => m !== "set" && m !== "out").sort((a, b) => b.length - a.length).join("|")})`;
const ORD = String.raw`(?:st|nd|rd|th|º|o)?`;

function unitOf(word: string): "day" | "week" | "month" {
  if (/^(dia|day)/.test(word)) return "day";
  if (/^(semana|week)/.test(word)) return "week";
  return "month";
}

/** For comparing names: lowercase, no accents ("Ação" matches "acao"). */
export function foldForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Lowercase and strip accents one character at a time, so indexes still match the original. */
function normalize(text: string): string {
  return Array.from(text, (c) => {
    const base = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return base.length === 1 ? base : c.toLowerCase();
  }).join("");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Same day-of-month `months` later, clamped to the month's length (31 → 28/29/30). */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
}

function dayOfMonth(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

/** Next date (today included) that falls on `weekday`. */
function nextWeekday(today: Date, weekday: number): Date {
  return addDays(today, (weekday - today.getDay() + 7) % 7);
}

/** The given day/month this year, or next year if it already passed. */
function upcomingDate(today: Date, month: number, day: number, year?: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  if (year !== undefined) return dayOfMonth(year < 100 ? 2000 + year : year, month, day);
  const candidate = dayOfMonth(today.getFullYear(), month, day);
  return candidate < today ? dayOfMonth(today.getFullYear() + 1, month, day) : candidate;
}

interface Rule {
  re: RegExp;
  apply: (m: RegExpExecArray, original: string) => boolean | void;
}

export function parseQuickAdd(text: string, now = new Date()): ParsedTask {
  const norm = normalize(text);
  const used = new Array<boolean>(text.length).fill(false);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let date: Date | null = null;
  let time: { h: number; m: number } | null = null;
  let recurrence: TaskRecurrence | null = null;
  let interval = 1;
  let weekdayFromRecurrence: number | null = null;
  let priority: TaskPriority | null = null;
  let category: string | null = null;
  const tags: string[] = [];

  const setTime = (h: number, m: number) => {
    if (h > 23 || m > 59 || time) return false;
    time = { h, m };
  };

  // Order matters: specific phrases first, so "todas as sextas" isn't read as just "sexta".
  const rules: Rule[] = [
    { re: /(?<=^|\s)#([\p{L}\p{N}_-]+)/gu, apply: (m, original) => {
      if (category) return false;
      category = original.slice(m.index + 1, m.index + m[0].length);
    } },
    // "@tag" only at a word start, so e-mail addresses (ana@x.pt) stay in the title.
    { re: /(?<=^|\s)@([\p{L}\p{N}_-]+)/gu, apply: (m, original) => {
      const name = original.slice(m.index + 1, m.index + m[0].length).slice(0, 30);
      if (tags.length >= 10 || tags.some((t) => t.toLowerCase() === name.toLowerCase())) return;
      tags.push(name);
    } },
    { re: /(?<=^|\s)!(urgente|urgent|alta|high|media|medium|baixa|low)\b/g, apply: (m) => {
      if (priority) return false;
      priority = PRIORITIES[m[1]];
    } },
    // Recurrence
    { re: new RegExp(String.raw`\b(?:a cada|every) (\d{1,3}) ${UNIT}\b`, "g"), apply: (m) => {
      const n = Number(m[1]);
      if (recurrence || n < 1 || n > 365) return false;
      recurrence = { day: "daily", week: "weekly", month: "monthly" }[unitOf(m[2])] as TaskRecurrence;
      interval = n;
    } },
    { re: new RegExp(String.raw`\b(?:todas as|todos os|every) ${WEEKDAY}s?(?:-feiras?)?\b`, "g"), apply: (m) => {
      if (recurrence) return false;
      recurrence = "weekly";
      weekdayFromRecurrence = WEEKDAYS[m[1]];
    } },
    { re: /\b(?:todos os dias|todo dia|todo o dia|diariamente|every ?day|daily)\b/g, apply: () => {
      if (recurrence) return false;
      recurrence = "daily";
    } },
    { re: /\b(?:todas as semanas|toda semana|semanalmente|every week|weekly)\b/g, apply: () => {
      if (recurrence) return false;
      recurrence = "weekly";
    } },
    { re: /\b(?:todos os meses|todo mes|mensalmente|every month|monthly)\b/g, apply: () => {
      if (recurrence) return false;
      recurrence = "monthly";
    } },
    // Dates
    { re: /\b(?:depois de amanha|day after tomorrow)\b/g, apply: () => { if (date) return false; date = addDays(today, 2); } },
    { re: /\b(?:amanha|tomorrow)\b/g, apply: () => { if (date) return false; date = addDays(today, 1); } },
    { re: /\b(?:hoje|today|tonight)\b/g, apply: () => { if (date) return false; date = today; } },
    { re: new RegExp(String.raw`\b(?:daqui a|dentro de|em|in) (\d{1,3}) ${UNIT}\b`, "g"), apply: (m) => {
      if (date) return false;
      const n = Number(m[1]);
      const unit = unitOf(m[2]);
      date = unit === "day" ? addDays(today, n) : unit === "week" ? addDays(today, 7 * n) : addMonths(today, n);
    } },
    { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, apply: (m) => {
      if (date) return false;
      date = upcomingDate(today, Number(m[2]) - 1, Number(m[3]), Number(m[1]));
      if (!date) return false;
    } },
    { re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, apply: (m) => {
      if (date) return false;
      date = upcomingDate(today, Number(m[2]) - 1, Number(m[1]), m[3] ? Number(m[3]) : undefined);
      if (!date) return false;
    } },
    { re: new RegExp(String.raw`\b(?:(?:no )?dia )?(\d{1,2})${ORD} (?:de )?${MONTH}\b`, "g"), apply: (m) => {
      if (date) return false;
      date = upcomingDate(today, MONTHS[m[2]], Number(m[1]));
      if (!date) return false;
    } },
    { re: new RegExp(String.raw`\b(?:on )?${MONTH_FIRST} (\d{1,2})${ORD}\b`, "g"), apply: (m) => {
      if (date) return false;
      date = upcomingDate(today, MONTHS[m[1]], Number(m[2]));
      if (!date) return false;
    } },
    // "dia 1", "no dia 15", "on the 1st", "the 3rd": that day this month, or next month if passed.
    { re: /\b(?:(?:no |ao )?dia (\d{1,2})|(?:on )?the (\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th))\b/g, apply: (m) => {
      if (date) return false;
      const day = Number(m[1] ?? m[2] ?? m[3]);
      if (day < 1 || day > 31) return false;
      const thisMonth = dayOfMonth(today.getFullYear(), today.getMonth(), day);
      date = thisMonth < today ? dayOfMonth(today.getFullYear(), today.getMonth() + 1, day) : thisMonth;
    } },
    { re: new RegExp(String.raw`\b(?:(?:na|no|next|on|proxima|proximo|esta|este|this) )?${WEEKDAY}(?:-feira)?\b`, "g"), apply: (m) => {
      if (date) return false;
      date = nextWeekday(today, WEEKDAYS[m[1]]);
    } },
    // Times
    { re: /\b(?:(?:as|at|pelas) )?(\d{1,2})(?::|h)(\d{2})\s?(am|pm)?\b/g, apply: (m) => {
      let h = Number(m[1]);
      if (m[3] === "pm" && h < 12) h += 12;
      if (m[3] === "am" && h === 12) h = 0;
      return setTime(h, Number(m[2]));
    } },
    { re: /\b(?:(?:as|at|pelas) )?(\d{1,2})\s?(am|pm)\b/g, apply: (m) => {
      let h = Number(m[1]);
      if (h < 1 || h > 12) return false;
      if (m[2] === "pm" && h < 12) h += 12;
      if (m[2] === "am" && h === 12) h = 0;
      return setTime(h, 0);
    } },
    { re: /\b(?:(?:as|pelas) )?(\d{1,2})h\b/g, apply: (m) => setTime(Number(m[1]), 0) },
    { re: /\b(?:as|at|pelas) (\d{1,2})\b/g, apply: (m) => setTime(Number(m[1]), 0) },
  ];

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(norm))) {
      const start = m.index;
      const end = start + m[0].length;
      if (used.slice(start, end).some(Boolean)) continue;
      if (rule.apply(m, text) === false) continue;
      used.fill(true, start, end);
    }
  }

  // Resolve the due date. (`time` is assigned inside closures, so TS can't narrow it here.)
  const t = time as { h: number; m: number } | null;
  const at = (d: Date) =>
    t ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);

  let dueAt: Date | null = null;
  if (date) dueAt = at(date);
  else if (weekdayFromRecurrence !== null) dueAt = at(nextWeekday(today, weekdayFromRecurrence));
  else if (recurrence) dueAt = at(today);
  else if (t) {
    // Only a time: today, or tomorrow if that time has already gone.
    dueAt = at(today);
    if (dueAt < now) dueAt = at(addDays(today, 1));
  }

  // Indexes above are UTF-16 code units, so rebuild the title per code unit too (emoji-safe).
  const title = text
    .split("")
    .map((c, i) => (used[i] ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    dueAt,
    hasTime: time !== null,
    recurrence,
    recurrenceInterval: interval,
    priority,
    category,
    tags,
  };
}
