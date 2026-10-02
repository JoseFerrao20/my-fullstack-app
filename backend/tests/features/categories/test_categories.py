def test_category_crud(auth_client):
    res = auth_client.post("/api/categories", json={"name": " Work ", "color": "#ff0000"})
    assert res.status_code == 201
    cat = res.json()["data"]
    assert cat["name"] == "Work"

    assert [c["name"] for c in auth_client.get("/api/categories").json()["data"]] == ["Work"]

    res = auth_client.patch(f"/api/categories/{cat['id']}", json={"name": "Office"})
    assert res.json()["data"]["name"] == "Office"
    assert res.json()["data"]["color"] == "#ff0000"

    assert auth_client.delete(f"/api/categories/{cat['id']}").status_code == 200
    assert auth_client.get(f"/api/categories/{cat['id']}").status_code == 404


def test_category_name_unique_per_user(auth_client, other_client):
    auth_client.post("/api/categories", json={"name": "Home"})
    dup = auth_client.post("/api/categories", json={"name": "home"})
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "CATEGORY_EXISTS"
    # Another user may reuse the name.
    assert other_client.post("/api/categories", json={"name": "Home"}).status_code == 201


def test_invalid_color_rejected(auth_client):
    res = auth_client.post("/api/categories", json={"name": "X", "color": "red"})
    assert res.status_code == 422


def test_deleting_category_uncategorizes_tasks(auth_client, db):
    cat = auth_client.post("/api/categories", json={"name": "Work"}).json()["data"]
    task = auth_client.post("/api/tasks", json={"title": "T", "categoryId": cat["id"]}).json()["data"]
    assert task["category"]["name"] == "Work"

    auth_client.delete(f"/api/categories/{cat['id']}")
    db.expire_all()
    task = auth_client.get(f"/api/tasks/{task['id']}").json()["data"]
    assert task["categoryId"] is None
    assert task["category"] is None


def test_categories_are_private(auth_client, other_client):
    cat = auth_client.post("/api/categories", json={"name": "Secret"}).json()["data"]
    assert other_client.get(f"/api/categories/{cat['id']}").status_code == 404
    assert other_client.get("/api/categories").json()["data"] == []
