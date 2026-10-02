"""WebPushSender with real pywebpush crypto; only the HTTP call is faked."""

import base64
import json
import os

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import get_settings
from app.core.push import PushMessage, PushTarget, WebPushSender, generate_vapid_keys


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _browser_subscription() -> PushTarget:
    """Keys shaped exactly like a browser's PushSubscription."""
    key = ec.generate_private_key(ec.SECP256R1())
    p256dh = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return PushTarget("https://push.example.com/send/abc", _b64(p256dh), _b64(os.urandom(16)))


class FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code
        self.reason = "Gone" if status_code == 410 else "Error"
        self.text = ""
        self.headers: dict[str, str] = {}


@pytest.fixture
def vapid(monkeypatch):
    public, private = generate_vapid_keys()
    settings = get_settings()
    monkeypatch.setattr(settings, "vapid_public_key", public)
    monkeypatch.setattr(settings, "vapid_private_key", private)
    return public


def _fake_post(monkeypatch, status: int) -> list[dict]:
    calls: list[dict] = []

    def post(url, data=None, headers=None, timeout=None, **_):
        calls.append({"url": url, "data": data, "headers": headers})
        return FakeResponse(status)

    import pywebpush

    monkeypatch.setattr(pywebpush.requests, "post", post)
    return calls


def test_generated_keys_sign_and_encrypt(vapid, monkeypatch):
    calls = _fake_post(monkeypatch, 201)
    alive = WebPushSender().send(_browser_subscription(), PushMessage("Reminder: Call Ana", "Due 4 Mar, 09:30", "/today"))

    assert alive is True
    [call] = calls
    assert call["url"] == "https://push.example.com/send/abc"
    headers = {k.lower(): v for k, v in call["headers"].items()}
    assert headers["content-encoding"] == "aes128gcm"  # payload is encrypted
    assert "vapid" in headers["authorization"].lower() or headers["authorization"].lower().startswith("webpush")
    assert vapid in json.dumps(headers)  # our public key identifies the sender
    assert b"Call Ana" not in call["data"]  # not readable in transit


def test_gone_subscription_reports_dead(vapid, monkeypatch):
    _fake_post(monkeypatch, 410)
    assert WebPushSender().send(_browser_subscription(), PushMessage("t", "b")) is False


def test_other_failures_keep_the_subscription(vapid, monkeypatch):
    _fake_post(monkeypatch, 500)
    assert WebPushSender().send(_browser_subscription(), PushMessage("t", "b")) is True
