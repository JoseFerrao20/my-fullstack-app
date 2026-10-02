"""Minimal iCalendar (RFC 5545) writer for the task feed."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

EVENT_LENGTH = timedelta(minutes=30)
_RRULE_FREQ = {"daily": "DAILY", "weekly": "WEEKLY", "monthly": "MONTHLY"}


@dataclass(frozen=True)
class FeedEvent:
    uid: str
    title: str
    due_at: datetime
    updated_at: datetime
    timezone: str
    done: bool = False
    description: str | None = None
    categories: tuple[str, ...] = ()
    recurrence: str | None = None
    recurrence_interval: int = 1
    url: str | None = None


def escape_text(value: str) -> str:
    """TEXT value escaping (RFC 5545 §3.3.11)."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def fold(line: str) -> str:
    """Split lines longer than 75 octets; continuation lines start with a space (§3.1)."""
    out: list[str] = []
    current = ""
    for char in line:
        limit = 75 if not out else 74  # continuation lines lose one octet to the leading space
        if len((current + char).encode()) > limit:
            out.append(current)
            current = char
        else:
            current += char
    out.append(current)
    return "\r\n ".join(out)


def _utc(dt: datetime) -> str:
    return dt.astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")


def _event_lines(event: FeedEvent, stamp: datetime) -> list[str]:
    local = event.due_at.astimezone(ZoneInfo(event.timezone))
    lines = [
        "BEGIN:VEVENT",
        f"UID:{event.uid}",
        f"DTSTAMP:{_utc(stamp)}",
        f"LAST-MODIFIED:{_utc(event.updated_at)}",
        f"SUMMARY:{escape_text(('✓ ' if event.done else '') + event.title)}",
    ]
    if local.hour == 23 and local.minute == 59:
        # "Sometime that day" (quick add's default): an all-day event on the local date.
        day: date = local.date()
        lines += [f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}"]
    elif event.recurrence:
        # Local time + zone so repeats keep their wall-clock time across DST.
        lines += [
            f"DTSTART;TZID={event.timezone}:{local:%Y%m%dT%H%M%S}",
            f"DTEND;TZID={event.timezone}:{local + EVENT_LENGTH:%Y%m%dT%H%M%S}",
        ]
    else:
        lines += [f"DTSTART:{_utc(event.due_at)}", f"DTEND:{_utc(event.due_at + EVENT_LENGTH)}"]
    if event.recurrence and not event.done:
        rule = f"RRULE:FREQ={_RRULE_FREQ[event.recurrence]}"
        if event.recurrence_interval > 1:
            rule += f";INTERVAL={event.recurrence_interval}"
        lines.append(rule)
    if event.description:
        lines.append(f"DESCRIPTION:{escape_text(event.description)}")
    if event.categories:
        lines.append("CATEGORIES:" + ",".join(escape_text(c) for c in event.categories))
    if event.url:
        lines.append(f"URL:{event.url}")
    lines.append("END:VEVENT")
    return lines


def build_calendar(name: str, events: list[FeedEvent], stamp: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Task Manager//Tasks feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_text(name)}",
        # Hints for how often to re-fetch (Google Calendar decides on its own anyway).
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for event in events:
        lines += _event_lines(event, stamp)
    lines.append("END:VCALENDAR")
    return "".join(fold(line) + "\r\n" for line in lines)
