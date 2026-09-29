"""Background job that turns task due dates into in-app notifications."""

import logging
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.features.notifications.repository import NotificationRepository

logger = logging.getLogger(__name__)


def run_due_notifications_job(now: datetime | None = None) -> int:
    settings = get_settings()
    with SessionLocal() as db:
        created = NotificationRepository(db).generate_due_notifications(
            now or datetime.now(UTC), timedelta(hours=settings.due_soon_window_hours)
        )
    if created:
        logger.info("Created %d due-date notifications", created)
    return created


def create_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_due_notifications_job,
        "interval",
        seconds=get_settings().notification_interval_seconds,
        id="due_notifications",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC),
    )
    return scheduler
