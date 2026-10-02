import type { TFunction } from "i18next";
import { intlLocale } from "@/lib/i18n";
import type { Notification } from "@/lib/types";

/** Notification wording in the UI language (the server's `message` is an English fallback). */
export function notificationText(t: TFunction, n: Pick<Notification, "type" | "taskTitle">): string {
  return t(`notifications.${n.type}`, { title: n.taskTitle });
}

/** "5 minutes ago" / "há 5 minutos". */
export function timeAgo(iso: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto", style: "short" });
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}
