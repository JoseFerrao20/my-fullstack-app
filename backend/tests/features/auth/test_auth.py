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


def test_signup_stores_locale(client):
    res = client.post(
        "/api/auth/signup",
        json={"email": "ana@example.com", "name": "Ana", "password": "password123", "locale": "pt"},
    )
    assert res.json()["data"]["locale"] == "pt"


def test_locale_defaults_to_follow_browser(client):
    assert signup(client).json()["data"]["locale"] is None


def test_update_profile(auth_client):
    res = auth_client.patch("/api/auth/me", json={"name": " Alicia ", "locale": "pt"})
    assert res.status_code == 200
    assert res.json()["data"]["name"] == "Alicia"
    assert res.json()["data"]["locale"] == "pt"

    # null switches back to following the browser; omitted fields are untouched.
    res = auth_client.patch("/api/auth/me", json={"locale": None})
    assert res.json()["data"] == {**res.json()["data"], "name": "Alicia", "locale": None}

    assert auth_client.patch("/api/auth/me", json={"locale": "fr"}).status_code == 422
    assert auth_client.patch("/api/auth/me", json={"name": "  "}).status_code == 422
    assert auth_client.patch("/api/auth/me", json={"name": None}).status_code == 422
