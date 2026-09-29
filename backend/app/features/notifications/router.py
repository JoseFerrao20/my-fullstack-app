from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import Envelope, ok
from app.features.notifications.repository import NotificationRepository
from app.features.notifications.schemas import (
    NotificationListMeta,
    NotificationListQuery,
    NotificationOut,
)
from app.features.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _service(db: DbSession, user: CurrentUser) -> NotificationService:
    return NotificationService(NotificationRepository(db), user.id)


@router.get("", response_model=Envelope[list[NotificationOut]])
def list_notifications(
    query: Annotated[NotificationListQuery, Query()], db: DbSession, user: CurrentUser
):
    """List notifications, newest first. meta.unreadCount is always the full unread total."""
    items, unread_count = _service(db, user).list(query)
    return ok(
        [NotificationOut.model_validate(n) for n in items],
        NotificationListMeta(unread_count=unread_count),
    )


@router.patch("/{notification_id}/read", response_model=Envelope[NotificationOut])
def mark_read(notification_id: int, db: DbSession, user: CurrentUser):
    return ok(NotificationOut.model_validate(_service(db, user).mark_read(notification_id)))


@router.post("/read-all", response_model=Envelope[None])
def mark_all_read(db: DbSession, user: CurrentUser):
    updated = _service(db, user).mark_all_read()
    return ok(None, {"updated": updated})
