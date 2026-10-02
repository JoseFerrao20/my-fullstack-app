"""Delivering reminders (in-app + email + push) and the daily digest."""

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import EmailSender
from app.core.push import PushMessage, PushSender, PushTarget
from app.features.auth.repository import UserRepository
from app.features.reminders.messages import digest_email, reminder_email, reminder_push
from app.features.reminders.models import NotificationPreferences
from app.features.reminders.repository import (
    PreferencesRepository,
    PushSubscriptionRepository,
    ReminderRepository,
)
from app.features.reminders.schemas import PreferencesOut
from app.features.tasks.repository import TaskRepository

logger = logging.getLogger(__name__)

# A reminder that's this late (server down, or the task was created after its reminder time)
# is dropped instead of arriving out of context.
MAX_REMINDER_DELAY = timedelta(hours=1)
DIGEST_MAX_TASKS = 25


def _frontend_url(path: str) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}{path}"


def effective_preferences(prefs: NotificationPreferences | None) -> PreferencesOut:
    return PreferencesOut.model_validate(prefs) if prefs else PreferencesOut()


class PushService:
    def __init__(self, subscriptions: PushSubscriptionRepository, sender: PushSender):
        self.subscriptions = subscriptions
        self.sender = sender

    def send_to_user(self, user_id: int, message: PushMessage) -> int:
        """Send to every device of the user; prune subscriptions the browser has dropped."""
        delivered = 0
        for sub in self.subscriptions.for_user(user_id):
            alive = self.sender.send(PushTarget(sub.endpoint, sub.p256dh, sub.auth), message)
            if alive:
                delivered += 1
            else:
                self.subscriptions.delete_by_id(sub.id)
        return delivered


class ReminderService:
    def __init__(self, db: Session, email_sender: EmailSender, push_sender: PushSender):
        self.users = UserRepository(db)
        self.tasks = TaskRepository(db)
        self.prefs = PreferencesRepository(db)
        self.reminders = ReminderRepository(db)
        self.push = PushService(PushSubscriptionRepository(db), push_sender)
        self.email_sender = email_sender

    def send_due_reminders(self, now: datetime) -> int:
        claimed = self.reminders.claim_due_reminders(now, MAX_REMINDER_DELAY)
        for user_id, task_id in claimed:
            try:
                self._deliver(user_id, task_id)
            except Exception:  # noqa: BLE001 — one bad delivery must not stop the others
                logger.exception("Failed to deliver reminder for task %s", task_id)
        return len(claimed)

    def _deliver(self, user_id: int, task_id: int) -> None:
        user = self.users.get(user_id)
        task = self.tasks.get_for_user(user_id, task_id)
        if user is None or task is None or task.due_at is None:
            return
        prefs = effective_preferences(self.prefs.get(user_id))
        timezone = task.recurrence_timezone or prefs.timezone
        url = "/today"
        if prefs.push_reminders:
            message = reminder_push(
                title=task.title, due_at=task.due_at, timezone=timezone, locale=user.locale, url=url, task_id=task.id
            )
            self.push.send_to_user(user_id, message)
        if prefs.email_reminders:
            self.email_sender.send(
                reminder_email(
                    to=user.email,
                    name=user.name,
                    title=task.title,
                    due_at=task.due_at,
                    timezone=timezone,
                    locale=user.locale,
                    link=_frontend_url(url),
                )
            )

    def send_daily_digests(self, now: datetime) -> int:
        """Email each opted-in user once a day, during their chosen local hour."""
        sent = 0
        for prefs in self.prefs.with_digest():
            local_now = now.astimezone(ZoneInfo(prefs.timezone))
            if local_now.hour != prefs.digest_hour or prefs.last_digest_on == local_now.date():
                continue
            user = self.users.get(prefs.user_id)
            if user is None:
                continue
            start_of_day = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            tasks = self.reminders.open_tasks_due_before(user.id, end_of_day)[:DIGEST_MAX_TASKS]
            # Mark the day done even when there's nothing to say: no email on empty days.
            self.prefs.mark_digest_sent(prefs, local_now.date())
            if not tasks:
                continue
            items = [(t.title, t.due_at, t.due_at < start_of_day) for t in tasks if t.due_at is not None]
            self.email_sender.send(
                digest_email(
                    to=user.email,
                    name=user.name,
                    tasks=items,
                    timezone=prefs.timezone,
                    locale=user.locale,
                    link=_frontend_url("/today"),
                )
            )
            sent += 1
        return sent
