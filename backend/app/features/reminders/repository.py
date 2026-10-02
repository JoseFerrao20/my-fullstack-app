from datetime import date, datetime
from typing import Any

from sqlalchemy import delete, func, literal, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.features.notifications.models import Notification, NotificationType
from app.features.reminders.models import NotificationPreferences, PushSubscription
from app.features.tasks.models import Task, TaskStatus


class PreferencesRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: int) -> NotificationPreferences | None:
        return self.db.get(NotificationPreferences, user_id)

    def upsert(self, user_id: int, **fields: Any) -> NotificationPreferences:
        prefs = self.get(user_id)
        if prefs is None:
            prefs = NotificationPreferences(user_id=user_id)
            self.db.add(prefs)
        for key, value in fields.items():
            setattr(prefs, key, value)
        self.db.commit()
        self.db.refresh(prefs)
        return prefs

    def with_digest(self) -> list[NotificationPreferences]:
        return list(self.db.scalars(select(NotificationPreferences).where(NotificationPreferences.daily_digest)))

    def mark_digest_sent(self, prefs: NotificationPreferences, on: date) -> None:
        prefs.last_digest_on = on
        self.db.commit()


class PushSubscriptionRepository:
    def __init__(self, db: Session):
        self.db = db

    def upsert(self, *, user_id: int, endpoint: str, p256dh: str, auth: str, user_agent: str | None) -> None:
        # An endpoint belongs to one browser; if another user logs in there, it moves to them.
        stmt = insert(PushSubscription).values(
            user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth, user_agent=user_agent
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[PushSubscription.endpoint],
            set_={"user_id": user_id, "p256dh": p256dh, "auth": auth, "user_agent": user_agent},
        )
        self.db.execute(stmt)
        self.db.commit()

    def delete(self, user_id: int, endpoint: str) -> None:
        self.db.execute(
            delete(PushSubscription).where(
                PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint
            )
        )
        self.db.commit()

    def delete_by_id(self, subscription_id: int) -> None:
        self.db.execute(delete(PushSubscription).where(PushSubscription.id == subscription_id))
        self.db.commit()

    def for_user(self, user_id: int) -> list[PushSubscription]:
        return list(self.db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)))


class ReminderRepository:
    def __init__(self, db: Session):
        self.db = db

    def claim_due_reminders(self, now: datetime, max_delay: Any) -> list[tuple[int, int]]:
        """Create the in-app notification for every reminder that's due and return
        (user_id, task_id) for the ones created by this call.

        The unique (task_id, type) constraint makes this the single point that decides
        a reminder fires, so a reminder is delivered once even if jobs overlap.
        Reminders more than `max_delay` late (e.g. a task created after its reminder
        time, or the server was down) are skipped rather than sent stale.
        """
        remind_at = Task.due_at - func.make_interval(0, 0, 0, 0, 0, Task.remind_before_minutes)
        source = select(
            Task.user_id,
            Task.id,
            literal(NotificationType.REMINDER.value).cast(Notification.__table__.c.type.type),
            (literal("Reminder: ") + Task.title).label("message"),
        ).where(
            Task.status != TaskStatus.DONE,
            Task.due_at.is_not(None),
            Task.remind_before_minutes.is_not(None),
            remind_at <= now,
            remind_at > now - max_delay,
        )
        stmt = (
            insert(Notification)
            .from_select(["user_id", "task_id", "type", "message"], source)
            .on_conflict_do_nothing(constraint="uq_notifications_task_id_type")
            .returning(Notification.user_id, Notification.task_id)
        )
        rows = [(r.user_id, r.task_id) for r in self.db.execute(stmt)]
        self.db.commit()
        return rows

    def open_tasks_due_before(self, user_id: int, before: datetime) -> list[Task]:
        return list(
            self.db.scalars(
                select(Task)
                .where(
                    Task.user_id == user_id,
                    Task.status != TaskStatus.DONE,
                    Task.due_at.is_not(None),
                    Task.due_at < before,
                )
                .order_by(Task.due_at, Task.id)
            ).unique()
        )
