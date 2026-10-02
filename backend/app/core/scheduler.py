"""Background jobs. Runs in the API process, so deploy a single backend process (see Dockerfile)."""

import logging
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.rate_limit import RateLimiter
from app.features.auth.repository import PasswordResetRepository, SessionRepository
from app.features.notifications.scheduler import run_due_notifications_job

logger = logging.getLogger(__name__)

# Revoked sessions are kept a week for troubleshooting before they're deleted.
KEEP_REVOKED_SESSIONS = timedelta(days=7)
KEEP_RATE_LIMIT_EVENTS = timedelta(days=1)


def run_cleanup_job(now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    with SessionLocal() as db:
        sessions = SessionRepository(db).delete_stale(now, KEEP_REVOKED_SESSIONS)
        events = RateLimiter(db).delete_older_than(now - KEEP_RATE_LIMIT_EVENTS)
        resets = PasswordResetRepository(db).delete_stale(now)
    logger.info(
        "Cleanup: deleted %d sessions, %d rate-limit events, %d reset tokens", sessions, events, resets
    )


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
    scheduler.add_job(
        run_cleanup_job,
        "interval",
        hours=24,
        id="cleanup",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC) + timedelta(minutes=1),
    )
    return scheduler
