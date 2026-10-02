"""Web Push (browser notifications) via VAPID.

Generate a key pair for .env with:  python -m app.core.push
"""

import base64
import json
import logging
from dataclasses import dataclass
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: str
    url: str = "/"
    # Notifications with the same tag replace each other on the device.
    tag: str | None = None


@dataclass(frozen=True)
class PushTarget:
    endpoint: str
    p256dh: str
    auth: str


class PushSender(Protocol):
    def send(self, target: PushTarget, message: PushMessage) -> bool:
        """Deliver one message. Returns False if the subscription is gone and should be deleted."""
        ...


class WebPushSender:
    def send(self, target: PushTarget, message: PushMessage) -> bool:
        from pywebpush import WebPushException, webpush

        settings = get_settings()
        if not settings.push_enabled:
            return True
        try:
            webpush(
                subscription_info={"endpoint": target.endpoint, "keys": {"p256dh": target.p256dh, "auth": target.auth}},
                data=json.dumps({"title": message.title, "body": message.body, "url": message.url, "tag": message.tag}),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                ttl=60 * 60,
                timeout=10,
            )
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                return False  # The browser unsubscribed or the subscription expired.
            logger.warning("Web push failed (%s): %s", status, exc)
        except Exception:  # noqa: BLE001 — network trouble must not break the job loop
            logger.exception("Web push failed")
        return True


def get_push_sender() -> PushSender:
    return WebPushSender()


def generate_vapid_keys() -> tuple[str, str]:
    """(public, private) as base64url, the formats browsers and pywebpush expect."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()  # noqa: E731
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    private = key.private_numbers().private_value.to_bytes(32, "big")
    return b64(public), b64(private)


if __name__ == "__main__":
    public_key, private_key = generate_vapid_keys()
    print(f"VAPID_PUBLIC_KEY={public_key}\nVAPID_PRIVATE_KEY={private_key}")
