"""Imports every model so Base.metadata is complete (used by Alembic and tests)."""

from app.core.db import Base
from app.core.rate_limit import RateLimitEvent
from app.features.auth.models import AuthSession, PasswordResetToken, User
from app.features.categories.models import Category
from app.features.notifications.models import Notification
from app.features.reminders.models import NotificationPreferences, PushSubscription
from app.features.subtasks.models import Subtask
from app.features.tags.models import Tag
from app.features.tasks.models import Task

__all__ = [
    "AuthSession",
    "Base",
    "Category",
    "Notification",
    "NotificationPreferences",
    "PasswordResetToken",
    "PushSubscription",
    "RateLimitEvent",
    "Subtask",
    "Tag",
    "Task",
    "User",
]
