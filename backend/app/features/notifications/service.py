from datetime import UTC, datetime

from app.core.envelope import not_found
from app.features.notifications.models import Notification
from app.features.notifications.repository import NotificationRepository
from app.features.notifications.schemas import NotificationListQuery


class NotificationService:
    def __init__(self, repo: NotificationRepository, user_id: int):
        self.repo = repo
        self.user_id = user_id

    def list_notifications(self, query: NotificationListQuery) -> tuple[list[Notification], int]:
        items = self.repo.list_for_user(self.user_id, unread_only=query.unread, limit=query.limit)
        return items, self.repo.unread_count(self.user_id)

    def mark_read(self, notification_id: int) -> Notification:
        notification = self.repo.get_for_user(self.user_id, notification_id)
        if notification is None:
            raise not_found("Notification")
        return self.repo.mark_read(notification, datetime.now(UTC))

    def mark_all_read(self) -> int:
        return self.repo.mark_all_read(self.user_id, datetime.now(UTC))
