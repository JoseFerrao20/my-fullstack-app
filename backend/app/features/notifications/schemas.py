from datetime import datetime

from pydantic import Field

from app.core.schemas import CamelModel
from app.features.notifications.models import NotificationType


class NotificationListQuery(CamelModel):
    unread: bool = False
    limit: int = Field(default=50, ge=1, le=100)


class NotificationOut(CamelModel):
    id: int
    task_id: int
    type: NotificationType
    message: str
    read_at: datetime | None
    created_at: datetime


class NotificationListMeta(CamelModel):
    unread_count: int
