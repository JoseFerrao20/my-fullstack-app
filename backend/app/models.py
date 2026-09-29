"""Imports every model so Base.metadata is complete (used by Alembic and tests)."""

from app.core.db import Base
from app.features.auth.models import User
from app.features.categories.models import Category
from app.features.notifications.models import Notification
from app.features.tasks.models import Task

__all__ = ["Base", "Category", "Notification", "Task", "User"]
