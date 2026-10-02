"""Scheduled jobs (registered in app/core/scheduler.py)."""

import logging
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.core.email import SmtpEmailSender
from app.core.push import WebPushSender
from app.features.reminders.service import ReminderService

logger = logging.getLogger(__name__)


def run_reminders_job(now: datetime | None = None) -> int:
    with SessionLocal() as db:
        sent = ReminderService(db, SmtpEmailSender(), WebPushSender()).send_due_reminders(now or datetime.now(UTC))
    if sent:
        logger.info("Delivered %d reminders", sent)
    return sent


def run_digest_job(now: datetime | None = None) -> int:
    with SessionLocal() as db:
        sent = ReminderService(db, SmtpEmailSender(), WebPushSender()).send_daily_digests(now or datetime.now(UTC))
    if sent:
        logger.info("Sent %d daily digests", sent)
    return sent
