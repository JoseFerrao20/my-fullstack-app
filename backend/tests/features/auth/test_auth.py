from tests.conftest import signup


def test_signup_sets_cookies_and_returns_envelope(client):
    res = signup(client)
    assert res.status_code == 201
    body = res.json()
    assert body["error"] is None
    assert body["data"]["email"] == "alice@example.com"
    assert "createdAt" in body["data"]
    assert "hashedPassword" not in body["data"]
    assert "access_token" in res.cookies
    assert "refresh_token" in res.cookies


def test_signup_duplicate_email_conflicts(client):
    signup(client)
    res = signup(client, email="ALICE@example.com")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "EMAIL_TAKEN"


def test_signup_validation_error_envelope(client):
    res = client.post("/api/auth/signup", json={"email": "nope", "name": "", "password": "x"})
    assert res.status_code == 422
    body = res.json()
    assert body["data"] is None
    assert body["error"]["code"] == "VALIDATION_ERROR"
    fields = {d["field"] for d in body["error"]["details"]}
    assert {"email", "name", "password"} <= fields


def test_login_logout_me(client):
    signup(client)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401

    bad = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-pass"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_CREDENTIALS"

    res = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "password123"})
    assert res.status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["data"]["name"] == "Alice"


def test_refresh_issues_new_access_cookie(client):
    signup(client)
    client.cookies.delete("access_token")
    assert client.get("/api/auth/me").status_code == 401
    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_refresh_without_cookie_is_unauthorized(client):
    res = client.post("/api/auth/refresh")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_unknown_route_uses_error_envelope(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.json() == {
        "data": None,
        "error": {"code": "NOT_FOUND", "message": "Not Found", "details": None},
        "meta": None,
    }
