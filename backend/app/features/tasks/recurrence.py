"""Date math for recurring tasks.

Occurrences are computed from the series anchor (the first due date) as anchor + n * step,
in the user's time zone. Working from the anchor keeps day 31 from drifting (Jan 31 ->
Feb 28 -> Mar 31) and wall-clock arithmetic keeps 09:00 at 09:00 across DST changes.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil.relativedelta import relativedelta

from app.features.tasks.models import TaskRecurrence

# Safety cap: a daily task 30 years overdue still resolves well within this.
_MAX_STEPS = 20_000


def is_valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def _step(recurrence: TaskRecurrence, interval: int, n: int) -> relativedelta:
    count = interval * n
    match recurrence:
        case TaskRecurrence.DAILY:
            return relativedelta(days=count)
        case TaskRecurrence.WEEKLY:
            return relativedelta(weeks=count)
        case TaskRecurrence.MONTHLY:
            return relativedelta(months=count)


def next_due_date(
    *,
    anchor: datetime,
    previous_due: datetime,
    recurrence: TaskRecurrence,
    interval: int,
    timezone: str,
    now: datetime,
) -> datetime:
    """First occurrence after both the previous due date and now (overdue series skip ahead)."""
    tz = ZoneInfo(timezone)
    local_anchor = anchor.astimezone(tz)
    floor = max(previous_due, now)
    for n in range(1, _MAX_STEPS + 1):
        # Aware datetimes with ZoneInfo do wall-clock arithmetic; the UTC offset is re-derived.
        candidate = (local_anchor + _step(recurrence, interval, n)).astimezone(UTC)
        if candidate > floor:
            return candidate
    raise ValueError("Could not find a next occurrence")
