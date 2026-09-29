from datetime import datetime, timedelta

from sqlalchemy import delete, func, literal, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.features.notifications.models import Notification, NotificationType
from app.features.tasks.models import Task, TaskStatus


class NotificationRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_for_user(self, user_id: int, *, unread_only: bool, limit: int) -> list[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))
        stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)
        return list(self.db.scalars(stmt))

    def unread_count(self, user_id: int) -> int:
        stmt = select(func.count()).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
        return self.db.scalar(stmt) or 0

    def get_for_user(self, user_id: int, notification_id: int) -> Notification | None:
        return self.db.scalar(
            select(Notification).where(
                Notification.id == notification_id, Notification.user_id == user_id
            )
        )

    def mark_read(self, notification: Notification, now: datetime) -> Notification:
        if notification.read_at is None:
            notification.read_at = now
            self.db.commit()
            self.db.refresh(notification)
        return notification

    def mark_all_read(self, user_id: int, now: datetime) -> int:
        result = self.db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=now)
        )
        self.db.commit()
        return result.rowcount

    def delete_for_task(self, task_id: int) -> None:
        """Remove a task's notifications (no commit; caller owns the transaction)."""
        self.db.execute(delete(Notification).where(Notification.task_id == task_id))

    def generate_due_notifications(self, now: datetime, due_soon_window: timedelta) -> int:
        """Insert due_soon/overdue notifications for open tasks. Safe to run repeatedly."""
        open_task = Task.status != TaskStatus.DONE
        inserted = 0
        for ntype, condition, prefix in (
            (
                NotificationType.OVERDUE,
                Task.due_at <= now,
                "Overdue: ",
            ),
            (
                NotificationType.DUE_SOON,
                (Task.due_at > now) & (Task.due_at <= now + due_soon_window),
                "Due soon: ",
            ),
        ):
            source = select(
                Task.user_id,
                Task.id,
                literal(ntype.value).cast(Notification.__table__.c.type.type),
                (literal(prefix) + Task.title).label("message"),
            ).where(open_task, Task.due_at.is_not(None), condition)
            stmt = (
                insert(Notification)
                .from_select(["user_id", "task_id", "type", "message"], source)
                .on_conflict_do_nothing(constraint="uq_notifications_task_id_type")
            )
            inserted += self.db.execute(stmt).rowcount or 0
        self.db.commit()
        return inserted
