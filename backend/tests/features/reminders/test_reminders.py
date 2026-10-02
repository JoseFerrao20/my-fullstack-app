from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.features.reminders.models import PushSubscription
from app.features.reminders.service import ReminderService

NOW = datetime(2030, 3, 4, 9, 0, tzinfo=UTC)


def _task(client, title="Call Ana", due=NOW + timedelta(minutes=30), remind=60, **extra):
    body = {"title": title, "dueAt": due.isoformat(), "remindBeforeMinutes": remind, **extra}
    res = client.post("/api/tasks", json=body)
    assert res.status_code == 201, res.json()
    return res.json()["data"]


def _run(db, outbox, pushbox, now=NOW) -> int:
    return ReminderService(db, outbox, pushbox).send_due_reminders(now)


@pytest.fixture
def push_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "vapid_public_key", "test-public-key")
    monkeypatch.setattr(settings, "vapid_private_key", "test-private-key")


def _subscribe(client, endpoint="https://push.example.com/abc"):
    res = client.post(
        "/api/reminders/push/subscriptions",
        json={"endpoint": endpoint, "keys": {"p256dh": "key", "auth": "secret"}},
    )
    assert res.status_code == 200, res.json()


# --- task field -------------------------------------------------------------


def test_reminder_is_saved_and_needs_a_due_date(auth_client):
    assert _task(auth_client)["remindBeforeMinutes"] == 60
    res = auth_client.post("/api/tasks", json={"title": "x", "remindBeforeMinutes": 15})
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "dueAt"
    assert auth_client.post("/api/tasks", json={"title": "x", "dueAt": NOW.isoformat(), "remindBeforeMinutes": -1}).status_code == 422

    task = _task(auth_client)
    assert auth_client.patch(f"/api/tasks/{task['id']}", json={"dueAt": None}).status_code == 422


def test_next_occurrence_keeps_the_reminder(auth_client):
    task = _task(auth_client, recurrence="daily")
    next_id = auth_client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()["meta"]["nextOccurrence"]["id"]
    assert auth_client.get(f"/api/tasks/{next_id}").json()["data"]["remindBeforeMinutes"] == 60


# --- firing -----------------------------------------------------------------


def test_fires_once_with_email_and_in_app_notification(auth_client, db, outbox, pushbox):
    _task(auth_client)
    assert _run(db, outbox, pushbox) == 1
    assert _run(db, outbox, pushbox) == 0  # never twice

    [email] = outbox.sent
    assert email.subject == "Reminder: Call Ana"
    assert "due 4 Mar, 09:30" in email.text

    notes = auth_client.get("/api/notifications").json()["data"]
    assert [(n["type"], n["taskTitle"]) for n in notes] == [("reminder", "Call Ana")]


def test_respects_the_reminder_time(auth_client, db, outbox, pushbox):
    _task(auth_client, remind=15)  # 09:15
    assert _run(db, outbox, pushbox) == 0
    assert _run(db, outbox, pushbox, NOW + timedelta(minutes=15)) == 1


def test_at_due_time(auth_client, db, outbox, pushbox):
    _task(auth_client, due=NOW, remind=0)
    assert _run(db, outbox, pushbox) == 1


def test_skips_done_and_stale_reminders(auth_client, db, outbox, pushbox):
    done = _task(auth_client, title="Done")
    auth_client.patch(f"/api/tasks/{done['id']}", json={"status": "done"})
    _task(auth_client, title="Way back", due=NOW - timedelta(hours=1), remind=120)  # reminder was 3 h ago
    assert _run(db, outbox, pushbox) == 0


def test_changing_the_reminder_lets_it_fire_again(auth_client, db, outbox, pushbox):
    task = _task(auth_client)
    _run(db, outbox, pushbox)
    auth_client.patch(f"/api/tasks/{task['id']}", json={"remindBeforeMinutes": 30})
    assert _run(db, outbox, pushbox) == 1


def test_reminders_in_portuguese_and_local_time(auth_client, db, outbox, pushbox):
    auth_client.patch("/api/auth/me", json={"locale": "pt"})
    auth_client.patch("/api/reminders/preferences", json={"timezone": "Asia/Tokyo"})
    _task(auth_client)
    _run(db, outbox, pushbox)
    assert outbox.sent[0].subject == "Lembrete: Call Ana"
    assert "18:30" in outbox.sent[0].text  # 09:30 UTC in Tokyo


def test_push_and_preferences(auth_client, db, outbox, pushbox, push_on):
    _subscribe(auth_client, "https://push.example.com/laptop")
    _subscribe(auth_client, "https://push.example.com/phone")
    auth_client.patch("/api/reminders/preferences", json={"emailReminders": False})
    _task(auth_client)

    _run(db, outbox, pushbox)

    assert outbox.sent == []
    assert {t.endpoint for t, _ in pushbox.sent} == {"https://push.example.com/laptop", "https://push.example.com/phone"}
    message = pushbox.sent[0][1]
    assert message.title == "Reminder: Call Ana"
    assert message.body == "Due 4 Mar, 09:30"
    assert message.url == "/today"


def test_push_off_sends_no_push(auth_client, db, outbox, pushbox, push_on):
    _subscribe(auth_client)
    auth_client.patch("/api/reminders/preferences", json={"pushReminders": False})
    _task(auth_client)
    _run(db, outbox, pushbox)
    assert pushbox.sent == []
    assert len(outbox.sent) == 1


def test_dead_push_subscriptions_are_removed(auth_client, db, outbox, pushbox, push_on):
    _subscribe(auth_client, "https://push.example.com/gone")
    pushbox.gone.add("https://push.example.com/gone")
    _task(auth_client)
    _run(db, outbox, pushbox)
    assert db.scalars(select(PushSubscription)).all() == []


# --- daily digest -------------------------------------------------------------

LISBON_8_10 = datetime(2030, 7, 1, 7, 10, tzinfo=UTC)  # 08:10 in Lisbon (summer time)


def _digest(db, outbox, pushbox, now=LISBON_8_10) -> int:
    return ReminderService(db, outbox, pushbox).send_daily_digests(now)


def test_daily_digest(auth_client, db, outbox, pushbox):
    auth_client.patch("/api/reminders/preferences", json={"dailyDigest": True, "digestHour": 8, "timezone": "Europe/Lisbon"})
    for title, due in [
        ("Late", LISBON_8_10 - timedelta(days=1)),
        ("Today", LISBON_8_10 + timedelta(hours=5)),
        ("Tomorrow", LISBON_8_10 + timedelta(days=1)),
    ]:
        auth_client.post("/api/tasks", json={"title": title, "dueAt": due.isoformat()})

    assert _digest(db, outbox, pushbox, LISBON_8_10 - timedelta(hours=1)) == 0  # 07:10, not yet
    assert _digest(db, outbox, pushbox) == 1
    assert _digest(db, outbox, pushbox, LISBON_8_10 + timedelta(minutes=30)) == 0  # once a day

    [email] = outbox.sent
    assert email.subject == "Your day: 2 tasks"
    assert "- Late (30 Jun, 08:10, overdue)" in email.text
    assert "- Today (1 Jul, 13:10)" in email.text
    assert "Tomorrow" not in email.text
    assert "http://localhost/today" in email.text


def test_no_digest_on_empty_days_or_when_off(auth_client, db, outbox, pushbox):
    auth_client.patch("/api/reminders/preferences", json={"dailyDigest": True, "digestHour": 8, "timezone": "Europe/Lisbon"})
    assert _digest(db, outbox, pushbox) == 0
    auth_client.post("/api/tasks", json={"title": "Today", "dueAt": (LISBON_8_10 + timedelta(hours=1)).isoformat()})
    assert _digest(db, outbox, pushbox) == 0  # today's slot was already used, even though empty

    auth_client.patch("/api/reminders/preferences", json={"dailyDigest": False})
    assert _digest(db, outbox, pushbox, LISBON_8_10 + timedelta(days=1)) == 0
    assert outbox.sent == []


# --- endpoints ----------------------------------------------------------------


def test_preferences_endpoints(auth_client):
    assert auth_client.get("/api/reminders/preferences").json()["data"] == {
        "emailReminders": True,
        "pushReminders": True,
        "dailyDigest": False,
        "digestHour": 8,
        "timezone": "UTC",
    }
    res = auth_client.patch("/api/reminders/preferences", json={"dailyDigest": True, "digestHour": 7})
    assert res.json()["data"]["dailyDigest"] is True
    assert res.json()["data"]["digestHour"] == 7
    assert auth_client.patch("/api/reminders/preferences", json={"digestHour": 24}).status_code == 422
    assert auth_client.patch("/api/reminders/preferences", json={"timezone": "Mars/Base"}).status_code == 422
    assert auth_client.get("/api/reminders/preferences").json()["data"]["digestHour"] == 7


def test_push_is_off_without_keys(auth_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "vapid_public_key", None)
    assert auth_client.get("/api/reminders/push/config").json()["data"] == {"publicKey": None}
    res = auth_client.post(
        "/api/reminders/push/subscriptions",
        json={"endpoint": "https://push.example.com/x", "keys": {"p256dh": "k", "auth": "a"}},
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PUSH_DISABLED"


def test_push_subscriptions_endpoints(auth_client, other_client, db, push_on):
    assert auth_client.get("/api/reminders/push/config").json()["data"] == {"publicKey": "test-public-key"}
    _subscribe(auth_client)
    _subscribe(auth_client)  # idempotent
    assert len(db.scalars(select(PushSubscription)).all()) == 1

    # The same browser used by someone else moves to them.
    _subscribe(other_client)
    other_id = other_client.get("/api/auth/me").json()["data"]["id"]
    db.expire_all()
    [sub] = db.scalars(select(PushSubscription)).all()
    assert sub.user_id == other_id

    res = other_client.request("DELETE", "/api/reminders/push/subscriptions", json={"endpoint": "https://push.example.com/abc"})
    assert res.status_code == 200
    assert db.scalars(select(PushSubscription)).all() == []

    bad = auth_client.post(
        "/api/reminders/push/subscriptions", json={"endpoint": "http://insecure", "keys": {"p256dh": "k", "auth": "a"}}
    )
    assert bad.status_code == 422


def test_test_push(auth_client, pushbox, push_on):
    _subscribe(auth_client)
    res = auth_client.post("/api/reminders/push/test")
    assert res.json()["meta"] == {"delivered": 1}
    assert pushbox.sent[0][1].title == "Notifications are on"
