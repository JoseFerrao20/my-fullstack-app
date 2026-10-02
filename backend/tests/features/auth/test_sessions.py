from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.features.auth.models import AuthSession
from main import app
from tests.conftest import signup

LOGIN = {"email": "alice@example.com", "password": "password123"}


def _cookie(client: TestClient, name: str) -> str:
    return next(c.value for c in client.cookies.jar if c.name == name)


def _login(client: TestClient, **overrides):
    return client.post("/api/auth/login", json={**LOGIN, **overrides})


def _with_cookies(**cookies: str) -> TestClient:
    """A fresh client presenting exactly these cookies (e.g. a stolen or stale token)."""
    other = TestClient(app)
    for name, value in cookies.items():
        path = "/api/auth" if name == "refresh_token" else "/"
        other.cookies.set(name, value, domain="testserver.local", path=path)
    return other


def test_logout_cuts_access_immediately(client):
    signup(client)
    stolen_access = _cookie(client, "access_token")
    assert _with_cookies(access_token=stolen_access).get("/api/auth/me").status_code == 200

    client.post("/api/auth/logout")

    # The access token hasn't expired yet, but its session is revoked.
    assert _with_cookies(access_token=stolen_access).get("/api/auth/me").status_code == 401


def test_logout_with_only_refresh_cookie_still_revokes(client, db):
    signup(client)
    client.cookies.delete("access_token")
    client.post("/api/auth/logout")
    assert db.scalar(select(AuthSession)).revoked_at is not None


def test_refresh_rotates_token(client):
    signup(client)
    first = _cookie(client, "refresh_token")
    assert client.post("/api/auth/refresh").status_code == 200
    second = _cookie(client, "refresh_token")
    assert second != first
    assert client.get("/api/auth/me").status_code == 200


def test_concurrent_refresh_within_grace_is_accepted(client):
    signup(client)
    old = _cookie(client, "refresh_token")
    client.post("/api/auth/refresh")  # tab A rotates

    res = _with_cookies(refresh_token=old).post("/api/auth/refresh")  # tab B, same old cookie
    assert res.status_code == 200
    # No new refresh cookie: the browser already holds tab A's.
    assert "refresh_token" not in res.cookies
    assert client.get("/api/auth/me").status_code == 200


def test_replayed_refresh_token_revokes_session(client, db):
    signup(client)
    old = _cookie(client, "refresh_token")
    client.post("/api/auth/refresh")
    session = db.scalar(select(AuthSession))
    session.rotated_at = datetime.now(UTC) - timedelta(minutes=5)
    db.commit()

    res = _with_cookies(refresh_token=old).post("/api/auth/refresh")
    assert res.status_code == 401
    # Reuse means theft: the legitimate holder is logged out too.
    assert client.post("/api/auth/refresh").status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_failed_refresh_clears_cookies(client):
    signup(client)
    client.post("/api/auth/logout-all")
    res = _with_cookies(refresh_token="garbage").post("/api/auth/refresh")
    assert res.status_code == 401
    assert any("refresh_token=" in h and "Max-Age=0" in h for h in res.headers.get_list("set-cookie"))


def test_logout_all_ends_every_device(client):
    signup(client)
    laptop = TestClient(app)
    assert _login(laptop).status_code == 200
    phone = TestClient(app)
    assert _login(phone).status_code == 200

    res = phone.post("/api/auth/logout-all")
    assert res.json()["meta"] == {"sessionsEnded": 3}
    for device in (client, laptop, phone):
        assert device.get("/api/auth/me").status_code == 401
        assert device.post("/api/auth/refresh").status_code == 401


def test_login_rate_limit(client):
    signup(client)
    for _ in range(5):
        assert _login(client, password="wrong-password").status_code == 401

    res = _login(client, password="wrong-password")
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "TOO_MANY_REQUESTS"
    retry_after = int(res.headers["Retry-After"])
    assert 0 < retry_after <= 15 * 60
    assert res.json()["error"]["details"] == {"retryAfter": retry_after}
    # Even the right password is refused while locked out.
    assert _login(client).status_code == 429


def test_rate_limits_can_be_disabled_for_e2e_runs(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "disable_rate_limits", True)
    signup(client)
    for _ in range(8):
        assert _login(client, password="wrong-password").status_code == 401
    assert _login(client).status_code == 200


def test_successful_login_resets_email_counter(client):
    signup(client)
    for _ in range(4):
        _login(client, password="wrong-password")
    assert _login(client).status_code == 200
    for _ in range(4):
        assert _login(client, password="wrong-password").status_code == 401


def test_rate_limit_is_per_email(client):
    signup(client)
    signup(TestClient(app), email="bob@example.com")
    for _ in range(5):
        _login(client, password="wrong-password")
    assert _login(client).status_code == 429
    assert _login(client, email="bob@example.com").status_code == 200


def test_cleanup_deletes_expired_and_old_revoked_sessions(client, db):
    from app.features.auth.repository import SessionRepository

    signup(client)
    for _ in range(2):
        _login(TestClient(app))
    expired, revoked, active = db.scalars(select(AuthSession)).all()
    now = datetime.now(UTC)
    expired.expires_at = now - timedelta(seconds=1)
    revoked.revoked_at = now - timedelta(days=8)
    db.commit()

    assert SessionRepository(db).delete_stale(now, timedelta(days=7)) == 2
    assert [s.id for s in db.scalars(select(AuthSession))] == [active.id]
