from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from app.features.tasks.models import TaskRecurrence
from app.features.tasks.recurrence import is_valid_timezone, next_due_date

LISBON = ZoneInfo("Europe/Lisbon")
LONG_AGO = datetime(2000, 1, 1, tzinfo=UTC)


def nxt(anchor, recurrence, interval=1, previous=None, now=LONG_AGO, tz="UTC"):
    return next_due_date(
        anchor=anchor,
        previous_due=previous or anchor,
        recurrence=recurrence,
        interval=interval,
        timezone=tz,
        now=now,
    )


@pytest.mark.parametrize(
    ("recurrence", "interval", "expected"),
    [
        (TaskRecurrence.DAILY, 1, datetime(2030, 1, 11, 9, tzinfo=UTC)),
        (TaskRecurrence.DAILY, 3, datetime(2030, 1, 13, 9, tzinfo=UTC)),
        (TaskRecurrence.WEEKLY, 1, datetime(2030, 1, 17, 9, tzinfo=UTC)),
        (TaskRecurrence.WEEKLY, 2, datetime(2030, 1, 24, 9, tzinfo=UTC)),
        (TaskRecurrence.MONTHLY, 1, datetime(2030, 2, 10, 9, tzinfo=UTC)),
    ],
)
def test_basic_steps(recurrence, interval, expected):
    assert nxt(datetime(2030, 1, 10, 9, tzinfo=UTC), recurrence, interval) == expected


def test_month_end_does_not_drift():
    anchor = datetime(2030, 1, 31, 9, tzinfo=UTC)
    feb = nxt(anchor, TaskRecurrence.MONTHLY)
    assert feb == datetime(2030, 2, 28, 9, tzinfo=UTC)
    # The next one is computed from the anchor again, so it's back on the 31st.
    assert nxt(anchor, TaskRecurrence.MONTHLY, previous=feb) == datetime(2030, 3, 31, 9, tzinfo=UTC)


def test_keeps_local_time_across_dst():
    # 09:00 Lisbon on Friday 22 March 2030 is 09:00 UTC (winter time).
    anchor = datetime(2030, 3, 22, 9, tzinfo=LISBON)
    result = nxt(anchor, TaskRecurrence.WEEKLY, tz="Europe/Lisbon")
    # Clocks go forward on 31 March; a week later it's still 09:00 local, i.e. 08:00 UTC.
    assert result.astimezone(LISBON).hour == 9
    assert result == datetime(2030, 3, 29, 9, tzinfo=LISBON).astimezone(UTC)
    later = nxt(anchor, TaskRecurrence.WEEKLY, previous=result, tz="Europe/Lisbon")
    assert later.astimezone(LISBON).hour == 9
    assert later.astimezone(UTC).hour == 8


def test_overdue_series_skips_to_first_future_date():
    anchor = datetime(2030, 1, 1, 9, tzinfo=UTC)
    now = datetime(2030, 1, 6, 12, tzinfo=UTC)
    assert nxt(anchor, TaskRecurrence.DAILY, now=now) == datetime(2030, 1, 7, 9, tzinfo=UTC)


def test_timezone_validation():
    assert is_valid_timezone("Europe/Lisbon")
    assert not is_valid_timezone("Mars/Olympus")
    assert not is_valid_timezone("../etc/passwd")
