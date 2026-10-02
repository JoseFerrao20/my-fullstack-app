from datetime import UTC, datetime, timedelta

FUTURE = datetime(2030, 1, 7, 9, tzinfo=UTC)  # a Monday


def _create(client, **fields):
    body = {"title": "Standup", "dueAt": FUTURE.isoformat(), "recurrence": "weekly", **fields}
    res = client.post("/api/tasks", json=body)
    assert res.status_code == 201, res.json()
    return res.json()["data"]


def _complete(client, task_id):
    return client.patch(f"/api/tasks/{task_id}", json={"status": "done"})


def test_create_recurring_task(auth_client):
    task = _create(auth_client, recurrenceInterval=2, recurrenceTimezone="Europe/Lisbon")
    assert task["recurrence"] == "weekly"
    assert task["recurrenceInterval"] == 2
    assert task["recurrenceTimezone"] == "Europe/Lisbon"
    assert task["nextOccurrenceId"] is None


def test_timezone_defaults_to_utc(auth_client):
    assert _create(auth_client)["recurrenceTimezone"] == "UTC"


def test_recurrence_requires_due_date(auth_client):
    res = auth_client.post("/api/tasks", json={"title": "x", "recurrence": "daily"})
    assert res.status_code == 422
    assert res.json()["error"]["details"] == [
        {"field": "dueAt", "message": "A due date is required for repeating tasks"}
    ]

    task = _create(auth_client)
    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"dueAt": None})
    assert res.status_code == 422


def test_recurrence_validation(auth_client):
    base = {"title": "x", "dueAt": FUTURE.isoformat()}
    assert auth_client.post("/api/tasks", json={**base, "recurrence": "yearly"}).status_code == 422
    assert auth_client.post("/api/tasks", json={**base, "recurrence": "daily", "recurrenceInterval": 0}).status_code == 422
    res = auth_client.post("/api/tasks", json={**base, "recurrence": "daily", "recurrenceTimezone": "Mars/Base"})
    assert res.status_code == 422


def test_completing_creates_next_occurrence(auth_client):
    cat = auth_client.post("/api/categories", json={"name": "Work"}).json()["data"]
    task = _create(auth_client, priority="high", description="Notes", categoryId=cat["id"])

    res = _complete(auth_client, task["id"])
    assert res.status_code == 200
    body = res.json()
    next_info = body["meta"]["nextOccurrence"]
    assert next_info["dueAt"].startswith("2030-01-14T09:00")
    assert body["data"]["nextOccurrenceId"] == next_info["id"]

    nxt = auth_client.get(f"/api/tasks/{next_info['id']}").json()["data"]
    assert nxt["status"] == "todo"
    assert nxt["title"] == "Standup"
    assert nxt["priority"] == "high"
    assert nxt["description"] == "Notes"
    assert nxt["categoryId"] == cat["id"]
    assert nxt["recurrence"] == "weekly"


def test_recompleting_does_not_duplicate(auth_client):
    task = _create(auth_client)
    _complete(auth_client, task["id"])
    auth_client.patch(f"/api/tasks/{task['id']}", json={"status": "todo"})
    res = _complete(auth_client, task["id"])
    assert res.json()["meta"] is None
    assert auth_client.get("/api/tasks").json()["meta"]["total"] == 2


def test_chain_keeps_going(auth_client):
    task = _create(auth_client)
    second = _complete(auth_client, task["id"]).json()["meta"]["nextOccurrence"]
    third = _complete(auth_client, second["id"]).json()["meta"]["nextOccurrence"]
    assert third["dueAt"].startswith("2030-01-21T09:00")


def test_resaving_unchanged_series_keeps_month_end_anchor(auth_client):
    jan31 = datetime(2030, 1, 31, 9, tzinfo=UTC)
    task = _create(auth_client, recurrence="monthly", dueAt=jan31.isoformat())
    feb = _complete(auth_client, task["id"]).json()["meta"]["nextOccurrence"]
    assert feb["dueAt"].startswith("2030-02-28T09:00")

    # The edit form resends every field; renaming must not re-anchor the series on Feb 28.
    feb_task = auth_client.get(f"/api/tasks/{feb['id']}").json()["data"]
    auth_client.patch(
        f"/api/tasks/{feb['id']}",
        json={
            "title": "Pay rent",
            "dueAt": feb_task["dueAt"],
            "recurrence": "monthly",
            "recurrenceInterval": 1,
            "recurrenceTimezone": "UTC",
        },
    )
    mar = _complete(auth_client, feb["id"]).json()["meta"]["nextOccurrence"]
    assert mar["dueAt"].startswith("2030-03-31T09:00")


def test_overdue_task_skips_to_future(auth_client):
    past = datetime.now(UTC).replace(microsecond=0) - timedelta(days=5)
    task = _create(auth_client, recurrence="daily", dueAt=past.isoformat())
    next_due = datetime.fromisoformat(_complete(auth_client, task["id"]).json()["meta"]["nextOccurrence"]["dueAt"])
    assert datetime.now(UTC) < next_due <= datetime.now(UTC) + timedelta(days=1)


def test_stopping_recurrence(auth_client):
    task = _create(auth_client)
    res = auth_client.patch(f"/api/tasks/{task['id']}", json={"recurrence": None})
    assert res.json()["data"]["recurrence"] is None
    assert _complete(auth_client, task["id"]).json()["meta"] is None
    assert auth_client.get("/api/tasks").json()["meta"]["total"] == 1


def test_non_recurring_completion_has_no_meta(auth_client):
    task = auth_client.post("/api/tasks", json={"title": "Once"}).json()["data"]
    assert _complete(auth_client, task["id"]).json()["meta"] is None
