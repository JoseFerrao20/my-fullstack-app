from datetime import UTC, datetime


def _task(client, **extra):
    return client.post("/api/tasks", json={"title": "Move house", **extra}).json()["data"]


def _add(client, task_id, title):
    res = client.post(f"/api/tasks/{task_id}/subtasks", json={"title": title})
    assert res.status_code == 201, res.json()
    return res.json()["data"]


def _steps(client, task_id):
    return [(s["title"], s["done"]) for s in client.get(f"/api/tasks/{task_id}").json()["data"]["subtasks"]]


def test_new_task_has_empty_checklist(auth_client):
    assert _task(auth_client)["subtasks"] == []


def test_add_tick_rename_delete(auth_client):
    task = _task(auth_client)
    boxes = _add(auth_client, task["id"], "  Buy boxes ")
    _add(auth_client, task["id"], "Book van")
    assert boxes["title"] == "Buy boxes"
    assert _steps(auth_client, task["id"]) == [("Buy boxes", False), ("Book van", False)]

    res = auth_client.patch(f"/api/tasks/{task['id']}/subtasks/{boxes['id']}", json={"done": True})
    assert res.json()["data"]["done"] is True
    auth_client.patch(f"/api/tasks/{task['id']}/subtasks/{boxes['id']}", json={"title": "Buy 20 boxes"})
    assert _steps(auth_client, task["id"]) == [("Buy 20 boxes", True), ("Book van", False)]

    assert auth_client.delete(f"/api/tasks/{task['id']}/subtasks/{boxes['id']}").status_code == 200
    assert _steps(auth_client, task["id"]) == [("Book van", False)]


def test_embedded_in_task_lists(auth_client):
    task = _task(auth_client)
    _add(auth_client, task["id"], "Step")
    [listed] = auth_client.get("/api/tasks").json()["data"]
    assert [s["title"] for s in listed["subtasks"]] == ["Step"]


def test_reorder(auth_client):
    task = _task(auth_client)
    a, b, c = (_add(auth_client, task["id"], t)["id"] for t in "ABC")
    res = auth_client.put(f"/api/tasks/{task['id']}/subtasks/order", json={"ids": [c, a, b]})
    assert [s["title"] for s in res.json()["data"]] == ["C", "A", "B"]
    assert [t for t, _ in _steps(auth_client, task["id"])] == ["C", "A", "B"]

    # A new step still goes last.
    _add(auth_client, task["id"], "D")
    assert [t for t, _ in _steps(auth_client, task["id"])] == ["C", "A", "B", "D"]

    bad = auth_client.put(f"/api/tasks/{task['id']}/subtasks/order", json={"ids": [c, a]})
    assert bad.status_code == 422


def test_validation_and_limit(auth_client):
    task = _task(auth_client)
    assert auth_client.post(f"/api/tasks/{task['id']}/subtasks", json={"title": "   "}).status_code == 422
    for i in range(50):
        _add(auth_client, task["id"], f"Step {i}")
    res = auth_client.post(f"/api/tasks/{task['id']}/subtasks", json={"title": "One too many"})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "TOO_MANY_SUBTASKS"


def test_private_to_the_task_owner(auth_client, other_client):
    task = _task(auth_client)
    step = _add(auth_client, task["id"], "Mine")
    assert other_client.get(f"/api/tasks/{task['id']}/subtasks").status_code == 404
    assert other_client.post(f"/api/tasks/{task['id']}/subtasks", json={"title": "x"}).status_code == 404
    assert other_client.patch(f"/api/tasks/{task['id']}/subtasks/{step['id']}", json={"done": True}).status_code == 404
    assert other_client.delete(f"/api/tasks/{task['id']}/subtasks/{step['id']}").status_code == 404

    # A step can't be reached through another task id either.
    other_task = _task(auth_client, title="Other")
    assert auth_client.patch(f"/api/tasks/{other_task['id']}/subtasks/{step['id']}", json={"done": True}).status_code == 404


def test_deleting_the_task_deletes_its_steps(auth_client, db):
    from sqlalchemy import func, select

    from app.features.subtasks.models import Subtask

    task = _task(auth_client)
    _add(auth_client, task["id"], "Step")
    auth_client.delete(f"/api/tasks/{task['id']}")
    assert db.scalar(select(func.count()).select_from(Subtask)) == 0


def test_next_occurrence_gets_fresh_checklist(auth_client):
    task = _task(auth_client, dueAt=datetime(2030, 1, 7, 9, tzinfo=UTC).isoformat(), recurrence="weekly")
    first = _add(auth_client, task["id"], "Water plants")
    _add(auth_client, task["id"], "Take out bins")
    auth_client.patch(f"/api/tasks/{task['id']}/subtasks/{first['id']}", json={"done": True})

    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"status": "done"})
    next_id = res.json()["meta"]["nextOccurrence"]["id"]

    assert _steps(auth_client, next_id) == [("Water plants", False), ("Take out bins", False)]
    assert _steps(auth_client, task["id"]) == [("Water plants", True), ("Take out bins", False)]
