from datetime import UTC, datetime, timedelta


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_create_task_defaults(auth_client):
    res = auth_client.post("/api/tasks", json={"title": "Buy milk"})
    assert res.status_code == 201
    task = res.json()["data"]
    assert task["status"] == "todo"
    assert task["priority"] == "medium"
    assert task["dueAt"] is None
    assert task["completedAt"] is None


def test_create_task_validation(auth_client):
    assert auth_client.post("/api/tasks", json={"title": "   "}).status_code == 422
    assert auth_client.post("/api/tasks", json={"title": "x", "priority": "extreme"}).status_code == 422
    # Naive datetimes are rejected: due dates must carry a timezone.
    res = auth_client.post("/api/tasks", json={"title": "x", "dueAt": "2030-01-01T10:00:00"})
    assert res.status_code == 422
    res = auth_client.post("/api/tasks", json={"title": "x", "categoryId": 999999})
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "categoryId"


def test_update_task_and_completion(auth_client):
    task = auth_client.post("/api/tasks", json={"title": "Write report"}).json()["data"]

    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"status": "done"})
    assert res.json()["data"]["completedAt"] is not None

    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"status": "in_progress"})
    assert res.json()["data"]["completedAt"] is None

    due = _iso(datetime(2030, 1, 1, tzinfo=UTC))
    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"dueAt": due, "priority": "urgent"})
    data = res.json()["data"]
    assert data["priority"] == "urgent"
    assert data["dueAt"].startswith("2030-01-01")

    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"dueAt": None})
    assert res.json()["data"]["dueAt"] is None

    assert auth_client.patch(f"/api/tasks/{task['id']}", json={"title": None}).status_code == 422


def test_delete_task(auth_client):
    task = auth_client.post("/api/tasks", json={"title": "Temp"}).json()["data"]
    assert auth_client.delete(f"/api/tasks/{task['id']}").status_code == 200
    assert auth_client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_list_filters_sort_and_pagination(auth_client):
    now = datetime.now(UTC)
    specs = [
        ("Alpha", "low", now + timedelta(days=3)),
        ("Bravo", "urgent", now + timedelta(days=1)),
        ("Charlie", "high", None),
        ("Delta report", "medium", now + timedelta(days=2)),
    ]
    for title, priority, due in specs:
        body = {"title": title, "priority": priority}
        if due:
            body["dueAt"] = _iso(due)
        auth_client.post("/api/tasks", json=body)

    res = auth_client.get("/api/tasks", params={"pageSize": 2, "page": 1, "sort": "dueAt"})
    body = res.json()
    assert body["meta"] == {"total": 4, "page": 1, "pageSize": 2}
    assert [t["title"] for t in body["data"]] == ["Bravo", "Delta report"]

    page2 = auth_client.get("/api/tasks", params={"pageSize": 2, "page": 2, "sort": "dueAt"}).json()
    # Tasks without a due date sort last.
    assert [t["title"] for t in page2["data"]] == ["Alpha", "Charlie"]

    by_priority = auth_client.get("/api/tasks", params={"sort": "-priority"}).json()["data"]
    assert [t["priority"] for t in by_priority] == ["urgent", "high", "medium", "low"]

    assert [t["title"] for t in auth_client.get("/api/tasks", params={"priority": "high"}).json()["data"]] == ["Charlie"]
    assert [t["title"] for t in auth_client.get("/api/tasks", params={"q": "REPORT"}).json()["data"]] == ["Delta report"]

    before = _iso(now + timedelta(days=2, hours=12))
    titles = {t["title"] for t in auth_client.get("/api/tasks", params={"dueBefore": before}).json()["data"]}
    assert titles == {"Bravo", "Delta report"}

    assert auth_client.get("/api/tasks", params={"pageSize": 1000}).status_code == 422
    assert auth_client.get("/api/tasks", params={"sort": "nope"}).status_code == 422


def test_sort_by_most_recently_completed(auth_client):
    ids = [auth_client.post("/api/tasks", json={"title": t}).json()["data"]["id"] for t in ("A", "B", "C")]
    for task_id in (ids[1], ids[0]):  # B completed first, then A; C stays open
        auth_client.patch(f"/api/tasks/{task_id}", json={"status": "done"})

    data = auth_client.get("/api/tasks", params={"status": "done", "sort": "-completedAt"}).json()["data"]
    assert [t["title"] for t in data] == ["A", "B"]


def test_filter_by_category(auth_client):
    cat = auth_client.post("/api/categories", json={"name": "Work"}).json()["data"]
    auth_client.post("/api/tasks", json={"title": "In cat", "categoryId": cat["id"]})
    auth_client.post("/api/tasks", json={"title": "No cat"})
    data = auth_client.get("/api/tasks", params={"categoryId": cat["id"]}).json()["data"]
    assert [t["title"] for t in data] == ["In cat"]


def test_tasks_are_private(auth_client, other_client):
    task = auth_client.post("/api/tasks", json={"title": "Mine"}).json()["data"]
    assert other_client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert other_client.patch(f"/api/tasks/{task['id']}", json={"title": "Hacked"}).status_code == 404
    assert other_client.delete(f"/api/tasks/{task['id']}").status_code == 404
    assert other_client.get("/api/tasks").json()["meta"]["total"] == 0

    # Another user's category can't be attached to your task.
    cat = auth_client.post("/api/categories", json={"name": "Private"}).json()["data"]
    res = other_client.post("/api/tasks", json={"title": "x", "categoryId": cat["id"]})
    assert res.status_code == 422


def test_requires_auth(client):
    res = client.get("/api/tasks")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"
