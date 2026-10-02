"""Job that turns task due dates into in-app notifications (scheduled in app/core/scheduler.py)."""

import logging
from datetime import UTC, datetime, timedelta

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

