from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.features.notifications.repository import NotificationRepository
from app.features.reminders.service import ReminderService
from app.features.tags.models import Tag
from app.features.tasks.models import Task
from app.features.tasks.repository import TaskRepository


def _task(client, title="Task", **extra):
    res = client.post("/api/tasks", json={"title": title, **extra})
    assert res.status_code == 201, res.json()
    return res.json()["data"]


# --- tags -------------------------------------------------------------------------


def test_tags_are_cleaned_and_shared(auth_client):
    a = _task(auth_client, "A", tags=[" @Work ", "urgent", "work", "#Home", ""])
    assert a["tags"] == ["Home", "urgent", "Work"]  # sorted by name, first spelling wins
    b = _task(auth_client, "B", tags=["WORK"])
    assert b["tags"] == ["Work"]  # matched the existing tag

    tags = auth_client.get("/api/tags").json()["data"]
    assert [(t["name"], t["taskCount"]) for t in tags] == [("Work", 2), ("Home", 1), ("urgent", 1)]


def test_replace_tags_and_unused_ones_disappear(auth_client):
    task = _task(auth_client, tags=["old", "keep"])
    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"tags": ["keep", "new"]})
    assert res.json()["data"]["tags"] == ["keep", "new"]
    assert [t["name"] for t in auth_client.get("/api/tags").json()["data"]] == ["keep", "new"]

    # Other fields don't touch tags; null isn't allowed (send [] to clear).
    assert auth_client.patch(f"/api/tasks/{task['id']}", json={"title": "x"}).json()["data"]["tags"] == ["keep", "new"]
    assert auth_client.patch(f"/api/tasks/{task['id']}", json={"tags": None}).status_code == 422
    assert auth_client.patch(f"/api/tasks/{task['id']}", json={"tags": []}).json()["data"]["tags"] == []
    assert auth_client.get("/api/tags").json()["data"] == []


def test_tag_validation(auth_client):
    assert auth_client.post("/api/tasks", json={"title": "x", "tags": ["a" * 31]}).status_code == 422
    assert auth_client.post("/api/tasks", json={"title": "x", "tags": [f"t{i}" for i in range(11)]}).status_code == 422


def test_filter_by_tag(auth_client):
    _task(auth_client, "Tagged", tags=["Cliente"])
    _task(auth_client, "Plain")
    titles = lambda tag: [t["title"] for t in auth_client.get("/api/tasks", params={"tag": tag}).json()["data"]]  # noqa: E731
    assert titles("cliente") == ["Tagged"]
    assert titles("@Cliente") == ["Tagged"]
    assert titles("nope") == []


def test_tags_are_private(auth_client, other_client):
    _task(auth_client, tags=["mine"])
    _task(other_client, tags=["mine"])  # same name, separate tag
    assert [t["taskCount"] for t in other_client.get("/api/tags").json()["data"]] == [1]
    assert other_client.get("/api/tasks", params={"tag": "mine"}).json()["meta"]["total"] == 1


def test_next_occurrence_keeps_tags(auth_client):
    task = _task(auth_client, dueAt=datetime(2030, 1, 7, 9, tzinfo=UTC).isoformat(), recurrence="weekly", tags=["gym"])
    next_id = auth_client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()["meta"]["nextOccurrence"]["id"]
    assert auth_client.get(f"/api/tasks/{next_id}").json()["data"]["tags"] == ["gym"]


# --- trash ------------------------------------------------------------------------


def test_delete_moves_to_trash_and_restore_brings_back(auth_client):
    task = _task(auth_client, tags=["work"])
    assert auth_client.delete(f"/api/tasks/{task['id']}").status_code == 200

    assert auth_client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert auth_client.get("/api/tasks").json()["meta"]["total"] == 0
    assert auth_client.get("/api/tags").json()["data"][0]["taskCount"] == 0  # tag kept while in trash
    [trashed] = auth_client.get("/api/trash").json()["data"]
    assert trashed["id"] == task["id"]
    assert trashed["deletedAt"] is not None

    res = auth_client.post(f"/api/tasks/{task['id']}/restore")
    assert res.status_code == 200
    assert res.json()["data"]["deletedAt"] is None
    assert res.json()["data"]["tags"] == ["work"]
    assert auth_client.get("/api/trash").json()["data"] == []
    assert auth_client.post(f"/api/tasks/{task['id']}/restore").status_code == 404  # not in trash


def test_trashed_tasks_cant_be_edited(auth_client):
    task = _task(auth_client)
    auth_client.delete(f"/api/tasks/{task['id']}")
    assert auth_client.patch(f"/api/tasks/{task['id']}", json={"title": "x"}).status_code == 404
    assert auth_client.post(f"/api/tasks/{task['id']}/subtasks", json={"title": "x"}).status_code == 404


def test_delete_forever_and_empty_trash(auth_client, db):
    a = _task(auth_client, "A", tags=["only-a"])
    b = _task(auth_client, "B")
    c = _task(auth_client, "C")
    for t in (a, b, c):
        auth_client.delete(f"/api/tasks/{t['id']}")

    assert auth_client.delete(f"/api/trash/{a['id']}").status_code == 200
    assert db.scalar(select(func.count()).select_from(Tag)) == 0  # its tag went with it
    assert auth_client.delete(f"/api/trash/{a['id']}").status_code == 404

    res = auth_client.delete("/api/trash")
    assert res.json()["meta"] == {"deleted": 2}
    assert db.scalar(select(func.count()).select_from(Task)) == 0


def test_live_tasks_cant_be_deleted_forever(auth_client):
    task = _task(auth_client)
    assert auth_client.delete(f"/api/trash/{task['id']}").status_code == 404


def test_trash_is_private(auth_client, other_client):
    task = _task(auth_client)
    auth_client.delete(f"/api/tasks/{task['id']}")
    assert other_client.get("/api/trash").json()["data"] == []
    assert other_client.post(f"/api/tasks/{task['id']}/restore").status_code == 404
    assert other_client.delete(f"/api/trash/{task['id']}").status_code == 404


def test_trashed_tasks_are_ignored_by_notifications_and_reminders(auth_client, db, outbox, pushbox):
    now = datetime.now(UTC)
    task = _task(auth_client, dueAt=(now - timedelta(minutes=5)).isoformat(), remindBeforeMinutes=0)
    NotificationRepository(db).generate_due_notifications(now, timedelta(hours=24))
    assert auth_client.get("/api/notifications").json()["meta"]["unreadCount"] == 1

    auth_client.delete(f"/api/tasks/{task['id']}")
    body = auth_client.get("/api/notifications").json()
    assert body["data"] == []
    assert body["meta"]["unreadCount"] == 0
    assert ReminderService(db, outbox, pushbox).send_due_reminders(now) == 0


def test_trash_is_purged_after_30_days(auth_client, db):
    task = _task(auth_client)
    auth_client.delete(f"/api/tasks/{task['id']}")
    repo = TaskRepository(db)
    assert repo.purge_trashed_before(datetime.now(UTC) - timedelta(days=30)) == 0
    assert repo.purge_trashed_before(datetime.now(UTC) + timedelta(seconds=1)) == 1
    assert auth_client.get("/api/trash").json()["data"] == []
