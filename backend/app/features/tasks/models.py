import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin
from app.features.categories.models import Category


class TaskStatus(enum.StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class TaskPriority(enum.StrEnum):
    # Declaration order is the sort order of the Postgres enum (low < urgent).
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskRecurrence(enum.StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


def _values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status", values_callable=_values),
        default=TaskStatus.TODO,
        index=True,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="task_priority", values_callable=_values),
        default=TaskPriority.MEDIUM,
        index=True,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Recurrence: completing the task creates the next occurrence (see tasks/recurrence.py).
    recurrence: Mapped[TaskRecurrence | None] = mapped_column(
        Enum(TaskRecurrence, name="task_recurrence", values_callable=_values)
    )
    recurrence_interval: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    # IANA zone whose wall-clock time is kept (09:00 Europe/Lisbon stays 09:00 across DST).
    recurrence_timezone: Mapped[str | None] = mapped_column(String(64))
    # First due date of the series; each occurrence is anchor + n * step, so day 31 doesn't drift.
    recurrence_anchor_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_occurrence_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL")
    )

    category: Mapped[Category | None] = relationship(lazy="joined")
