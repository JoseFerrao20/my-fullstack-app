from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.envelope import ApiError, Envelope, ok
from app.core.push import PushSender, get_push_sender
from app.features.reminders.messages import push_test_message
from app.features.reminders.repository import PreferencesRepository, PushSubscriptionRepository
from app.features.reminders.schemas import (
    PreferencesOut,
    PreferencesUpdate,
    PushConfigOut,
    PushSubscriptionIn,
    PushUnsubscribeIn,
)
from app.features.reminders.service import PushService, effective_preferences

router = APIRouter(prefix="/reminders", tags=["reminders"])

Pusher = Annotated[PushSender, Depends(get_push_sender)]


@router.get("/preferences", response_model=Envelope[PreferencesOut])
def get_preferences(user: CurrentUser, db: DbSession):
    """Reminder and digest settings (defaults if never saved)."""
    return ok(effective_preferences(PreferencesRepository(db).get(user.id)))


@router.patch("/preferences", response_model=Envelope[PreferencesOut])
def update_preferences(payload: PreferencesUpdate, user: CurrentUser, db: DbSession):
    fields = payload.model_dump(exclude_unset=True, exclude_none=True)
    return ok(effective_preferences(PreferencesRepository(db).upsert(user.id, **fields)))


@router.get("/push/config", response_model=Envelope[PushConfigOut])
def push_config(_: CurrentUser):
    """The VAPID public key browsers need to subscribe, or null when push is off."""
    settings = get_settings()
    return ok(PushConfigOut(public_key=settings.vapid_public_key if settings.push_enabled else None))


@router.post("/push/subscriptions", response_model=Envelope[None])
def subscribe(
    payload: PushSubscriptionIn, user: CurrentUser, db: DbSession, user_agent: Annotated[str | None, Header()] = None
):
    """Register this browser for push notifications (idempotent)."""
    if not get_settings().push_enabled:
        raise ApiError(409, "PUSH_DISABLED", "Push notifications are not configured on this server")
    PushSubscriptionRepository(db).upsert(
        user_id=user.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=(user_agent or "")[:300] or None,
    )
    return ok(None)


@router.delete("/push/subscriptions", response_model=Envelope[None])
def unsubscribe(payload: PushUnsubscribeIn, user: CurrentUser, db: DbSession):
    PushSubscriptionRepository(db).delete(user.id, payload.endpoint)
    return ok(None)


@router.post("/push/test", response_model=Envelope[None])
def send_test_push(user: CurrentUser, db: DbSession, sender: Pusher):
    """Send a test notification to all of the user's devices."""
    service = PushService(PushSubscriptionRepository(db), sender)
    delivered = service.send_to_user(user.id, push_test_message(user.locale))
    return ok(None, {"delivered": delivered})
