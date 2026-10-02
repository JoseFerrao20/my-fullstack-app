from datetime import UTC, datetime, timedelta

from app.features.notifications.repository import NotificationRepository

WINDOW = timedelta(hours=24)


def _generate(db, now=None) -> int:
    return NotificationRepository(db).generate_due_notifications(now or datetime.now(UTC), WINDOW)


def _make_task(client, title, due):
    body = {"title": title}
    if due is not None:
        body["dueAt"] = due.isoformat()
    return client.post("/api/tasks", json=body).json()["data"]


def test_job_creates_due_soon_and_overdue_once(auth_client, db):
    now = datetime.now(UTC)
    _make_task(auth_client, "Soon", now + timedelta(hours=2))
    _make_task(auth_client, "Late", now - timedelta(hours=1))
    _make_task(auth_client, "Far", now + timedelta(days=5))
    _make_task(auth_client, "Never", None)
    done = _make_task(auth_client, "Done late", now - timedelta(hours=1))
    auth_client.patch(f"/api/tasks/{done['id']}", json={"status": "done"})

    assert _generate(db, now) == 2
    assert _generate(db, now) == 0  # idempotent

    body = auth_client.get("/api/notifications").json()
    assert body["meta"]["unreadCount"] == 2
    by_type = {n["type"]: n["message"] for n in body["data"]}
    assert by_type == {"due_soon": "Due soon: Soon", "overdue": "Overdue: Late"}
    assert {n["type"]: n["taskTitle"] for n in body["data"]} == {"due_soon": "Soon", "overdue": "Late"}


def test_due_soon_task_later_becomes_overdue(auth_client, db):
    now = datetime.now(UTC)
    _make_task(auth_client, "Soon", now + timedelta(hours=1))
    assert _generate(db, now) == 1
    assert _generate(db, now + timedelta(hours=2)) == 1
    types = sorted(n["type"] for n in auth_client.get("/api/notifications").json()["data"])
    assert types == ["due_soon", "overdue"]


def test_changing_due_date_resets_notifications(auth_client, db):
    now = datetime.now(UTC)
    task = _make_task(auth_client, "Moved", now - timedelta(hours=1))
    _generate(db, now)
    assert auth_client.get("/api/notifications").json()["meta"]["unreadCount"] == 1

    new_due = (now + timedelta(days=10)).isoformat()
    auth_client.patch(f"/api/tasks/{task['id']}", json={"dueAt": new_due})
    assert auth_client.get("/api/notifications").json()["data"] == []
    assert _generate(db, now) == 0


def test_mark_read_and_read_all(auth_client, db):
    now = datetime.now(UTC)
    _make_task(auth_client, "A", now - timedelta(hours=1))
    _make_task(auth_client, "B", now + timedelta(hours=1))
    _generate(db, now)

    items = auth_client.get("/api/notifications", params={"unread": True}).json()["data"]
    first = items[0]
    res = auth_client.patch(f"/api/notifications/{first['id']}/read")
    assert res.json()["data"]["readAt"] is not None

    body = auth_client.get("/api/notifications", params={"unread": True}).json()
    assert body["meta"]["unreadCount"] == 1
    assert len(body["data"]) == 1

    res = auth_client.post("/api/notifications/read-all")
    assert res.json()["meta"] == {"updated": 1}
    assert auth_client.get("/api/notifications").json()["meta"]["unreadCount"] == 0


def test_notifications_are_private(auth_client, other_client, db):
    _make_task(auth_client, "Mine", datetime.now(UTC) - timedelta(hours=1))
    _generate(db)
    notification = auth_client.get("/api/notifications").json()["data"][0]
    assert other_client.get("/api/notifications").json()["data"] == []
    assert other_client.patch(f"/api/notifications/{notification['id']}/read").status_code == 404
