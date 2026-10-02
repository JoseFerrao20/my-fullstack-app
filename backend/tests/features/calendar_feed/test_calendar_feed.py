from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.features.calendar_feed.ics import FeedEvent, build_calendar, escape_text, fold
from main import app

STAMP = datetime(2030, 1, 1, 12, 0, tzinfo=UTC)


def _event(**overrides) -> FeedEvent:
    base = dict(
        uid="task-1@test",
        title="Call Ana",
        due_at=datetime(2030, 3, 4, 9, 30, tzinfo=UTC),
        updated_at=STAMP,
        timezone="UTC",
    )
    return FeedEvent(**{**base, **overrides})


# --- ICS writer -----------------------------------------------------------------


def test_escaping_and_folding():
    assert escape_text("a;b,c\\d\ne") == "a\\;b\\,c\\\\d\\ne"
    long = "SUMMARY:" + "é" * 60  # 2 bytes each
    folded = fold(long)
    assert all(len(part.encode()) <= 75 for part in folded.split("\r\n"))
    assert folded.replace("\r\n ", "") == long


def test_timed_event():
    ics = build_calendar("Tasks", [_event(description="Line 1\nLine 2", categories=("Work", "urgent"))], STAMP)
    assert ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "DTSTART:20300304T093000Z\r\n" in ics
    assert "DTEND:20300304T100000Z\r\n" in ics
    assert "SUMMARY:Call Ana\r\n" in ics
    assert "DESCRIPTION:Line 1\\nLine 2\r\n" in ics
    assert "CATEGORIES:Work,urgent\r\n" in ics
    assert "RRULE" not in ics


def test_end_of_day_tasks_are_all_day_in_local_time():
    # 23:59 in Lisbon (summer) is 22:59 UTC.
    ics = build_calendar("T", [_event(due_at=datetime(2030, 7, 1, 22, 59, tzinfo=UTC), timezone="Europe/Lisbon")], STAMP)
    assert "DTSTART;VALUE=DATE:20300701\r\n" in ics
    assert "DTEND;VALUE=DATE:20300702\r\n" in ics


def test_recurring_event_keeps_local_time_and_repeats():
    ics = build_calendar(
        "T",
        [_event(due_at=datetime(2030, 7, 1, 8, 0, tzinfo=UTC), timezone="Europe/Lisbon", recurrence="weekly", recurrence_interval=2)],
        STAMP,
    )
    assert "DTSTART;TZID=Europe/Lisbon:20300701T090000\r\n" in ics
    assert "RRULE:FREQ=WEEKLY;INTERVAL=2\r\n" in ics


def test_done_tasks_are_marked_and_dont_repeat():
    ics = build_calendar("T", [_event(done=True, recurrence="daily")], STAMP)
    assert "SUMMARY:✓ Call Ana\r\n" in ics
    assert "RRULE" not in ics


# --- endpoints -------------------------------------------------------------------


def _feed_path(url: str) -> str:
    return url.removeprefix("http://localhost")


def test_feed_lifecycle(auth_client):
    assert auth_client.get("/api/calendar-feed").json()["data"] == {"enabled": False, "createdAt": None}

    created = auth_client.post("/api/calendar-feed").json()["data"]
    assert created["enabled"] is True
    assert created["url"].startswith("http://localhost/api/ical/") and created["url"].endswith(".ics")
    assert auth_client.get("/api/calendar-feed").json()["data"]["enabled"] is True
    assert "url" not in auth_client.get("/api/calendar-feed").json()["data"]  # shown once only

    anonymous = TestClient(app)
    res = anonymous.get(_feed_path(created["url"]))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/calendar")
    assert "X-WR-CALNAME:Task Manager – Alice" in res.text

    # Regenerating kills the old URL.
    again = auth_client.post("/api/calendar-feed").json()["data"]
    assert anonymous.get(_feed_path(created["url"])).status_code == 404
    assert anonymous.get(_feed_path(again["url"])).status_code == 200

    auth_client.delete("/api/calendar-feed")
    assert anonymous.get(_feed_path(again["url"])).status_code == 404
    assert auth_client.get("/api/calendar-feed").json()["data"]["enabled"] is False


def test_feed_contents(auth_client):
    now = datetime.now(UTC)
    cat = auth_client.post("/api/categories", json={"name": "Work"}).json()["data"]
    auth_client.post("/api/tasks", json={"title": "Report", "dueAt": (now + timedelta(days=1)).isoformat(), "categoryId": cat["id"], "tags": ["client"]})
    auth_client.post("/api/tasks", json={"title": "No date"})
    old = auth_client.post("/api/tasks", json={"title": "Old done", "dueAt": (now - timedelta(days=60)).isoformat(), "status": "done"}).json()["data"]
    recent = auth_client.post("/api/tasks", json={"title": "Recent done", "dueAt": (now - timedelta(days=2)).isoformat(), "status": "done"}).json()["data"]
    trashed = auth_client.post("/api/tasks", json={"title": "Trashed", "dueAt": now.isoformat()}).json()["data"]
    auth_client.delete(f"/api/tasks/{trashed['id']}")

    url = auth_client.post("/api/calendar-feed").json()["data"]["url"]
    text = TestClient(app).get(_feed_path(url)).text

    assert "SUMMARY:Report" in text
    assert "CATEGORIES:Work,client" in text
    assert "SUMMARY:✓ Recent done" in text
    for missing in ("No date", "Old done", "Trashed"):
        assert missing not in text
    assert f"UID:task-{recent['id']}@localhost" in text
    assert f"task-{old['id']}@" not in text


def test_unknown_or_other_users_tokens(auth_client, other_client):
    assert TestClient(app).get("/api/ical/not-a-real-token.ics").status_code == 404
    other_client.post("/api/tasks", json={"title": "Bob's secret", "dueAt": datetime.now(UTC).isoformat()})
    url = auth_client.post("/api/calendar-feed").json()["data"]["url"]
    assert "Bob's secret" not in TestClient(app).get(_feed_path(url)).text


def test_feed_management_requires_login(client):
    assert client.post("/api/calendar-feed").status_code == 401
