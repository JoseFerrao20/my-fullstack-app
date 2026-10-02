import re
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.features.auth.models import AuthSession, PasswordResetToken, User
from app.features.categories.models import Category
from app.features.tasks.models import Task
from main import app
from tests.conftest import signup

EMAIL = "alice@example.com"


def _request_reset(client, email=EMAIL, **extra):
    return client.post("/api/auth/password-reset/request", json={"email": email, **extra})


def _token_from(outbox) -> str:
    match = re.search(r"/reset-password\?token=([\w-]+)", outbox.sent[-1].text)
    assert match, outbox.sent[-1].text
    return match.group(1)


def _login(client, password="password123"):
    return client.post("/api/auth/login", json={"email": EMAIL, "password": password})


# --- password reset -------------------------------------------------------


def test_reset_request_sends_link(client, outbox):
    signup(client)
    res = _request_reset(client)
    assert res.status_code == 202
    assert res.json() == {"data": None, "error": None, "meta": None}
    [email] = outbox.sent
    assert email.to == EMAIL
    assert email.subject == "Reset your Task Manager password"
    assert "http://localhost/reset-password?token=" in email.text
    assert "Choose a new password" in email.html


def test_reset_request_does_not_reveal_unknown_emails(client, outbox):
    signup(client)
    known = _request_reset(client)
    unknown = _request_reset(client, email="nobody@example.com")
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(outbox.sent) == 1  # only the real account got mail


def test_reset_email_language(client, outbox):
    signup(client)
    _request_reset(client, locale="pt")  # account follows the browser: use the request's language
    assert outbox.sent[-1].subject == "Redefinir a password do Gestor de Tarefas"

    client.patch("/api/auth/me", json={"locale": "en"})
    _request_reset(client, locale="pt")  # a saved account language wins
    assert outbox.sent[-1].subject == "Reset your Task Manager password"


def test_reset_confirm_changes_password_and_ends_sessions(client, outbox, db):
    signup(client)
    other_device = TestClient(app)
    assert _login(other_device).status_code == 200
    _request_reset(client)

    res = client.post(
        "/api/auth/password-reset/confirm", json={"token": _token_from(outbox), "newPassword": "brand-new-pass"}
    )
    assert res.status_code == 200
    assert outbox.sent[-1].subject == "Your Task Manager password was changed"

    for device in (client, other_device):
        assert device.get("/api/auth/me").status_code == 401
    assert _login(TestClient(app)).status_code == 401
    assert _login(TestClient(app), "brand-new-pass").status_code == 200


def test_reset_token_is_single_use(client, outbox):
    signup(client)
    _request_reset(client)
    token = _token_from(outbox)
    body = {"token": token, "newPassword": "brand-new-pass"}
    assert client.post("/api/auth/password-reset/confirm", json=body).status_code == 200
    res = client.post("/api/auth/password-reset/confirm", json=body)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_RESET_TOKEN"


def test_only_the_newest_reset_link_works(client, outbox):
    signup(client)
    _request_reset(client)
    first = _token_from(outbox)
    _request_reset(client)
    second = _token_from(outbox)

    old = client.post("/api/auth/password-reset/confirm", json={"token": first, "newPassword": "brand-new-pass"})
    assert old.status_code == 400
    new = client.post("/api/auth/password-reset/confirm", json={"token": second, "newPassword": "brand-new-pass"})
    assert new.status_code == 200


def test_expired_reset_token_is_rejected(client, outbox, db):
    signup(client)
    _request_reset(client)
    token = _token_from(outbox)
    reset = db.scalar(select(PasswordResetToken))
    reset.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    res = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "brand-new-pass"})
    assert res.status_code == 400


def test_reset_tokens_are_stored_hashed(client, outbox, db):
    signup(client)
    _request_reset(client)
    assert db.scalar(select(PasswordResetToken)).token_hash != _token_from(outbox)


def test_reset_confirm_validates_new_password(client):
    res = client.post("/api/auth/password-reset/confirm", json={"token": "x", "newPassword": "short"})
    assert res.status_code == 422


def test_reset_requests_are_rate_limited(client, outbox):
    signup(client)
    for _ in range(3):
        assert _request_reset(client).status_code == 202
    res = _request_reset(client)
    assert res.status_code == 429
    assert "Retry-After" in res.headers
    assert len(outbox.sent) == 3


# --- change password ------------------------------------------------------


def test_change_password_keeps_this_session_only(client, outbox):
    signup(client)
    other_device = TestClient(app)
    _login(other_device)

    res = client.post(
        "/api/auth/password", json={"currentPassword": "password123", "newPassword": "brand-new-pass"}
    )
    assert res.status_code == 200
    assert client.get("/api/auth/me").status_code == 200
    assert other_device.get("/api/auth/me").status_code == 401
    assert outbox.sent[-1].subject == "Your Task Manager password was changed"
    assert _login(TestClient(app), "brand-new-pass").status_code == 200


def test_change_password_requires_current_password(client):
    signup(client)
    res = client.post("/api/auth/password", json={"currentPassword": "nope", "newPassword": "brand-new-pass"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_PASSWORD"
    assert res.json()["error"]["details"][0]["field"] == "currentPassword"


def test_wrong_current_password_is_rate_limited(client):
    signup(client)
    body = {"currentPassword": "nope", "newPassword": "brand-new-pass"}
    for _ in range(5):
        assert client.post("/api/auth/password", json=body).status_code == 400
    assert client.post("/api/auth/password", json=body).status_code == 429


def test_change_password_requires_login(client):
    res = client.post("/api/auth/password", json={"currentPassword": "x", "newPassword": "brand-new-pass"})
    assert res.status_code == 401


# --- delete account -------------------------------------------------------


def test_delete_account_removes_everything(client, db):
    signup(client)
    cat = client.post("/api/categories", json={"name": "Work"}).json()["data"]
    client.post("/api/tasks", json={"title": "T", "categoryId": cat["id"]})
    other = TestClient(app)
    signup(other, email="bob@example.com")
    other.post("/api/tasks", json={"title": "Bob's task"})

    res = client.request("DELETE", "/api/auth/me", json={"password": "password123"})
    assert res.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert _login(TestClient(app)).status_code == 401

    count = lambda model: db.scalar(select(func.count()).select_from(model))  # noqa: E731
    assert count(User) == 1
    assert count(Category) == 0
    assert count(Task) == 1  # Bob's
    assert count(AuthSession) == 1  # Bob's
    assert other.get("/api/tasks").json()["meta"]["total"] == 1


def test_delete_account_requires_password(client):
    signup(client)
    res = client.request("DELETE", "/api/auth/me", json={"password": "wrong"})
    assert res.status_code == 400
    assert res.json()["error"]["details"][0]["field"] == "password"
    assert client.get("/api/auth/me").status_code == 200
