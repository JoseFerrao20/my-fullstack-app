from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator

from app.core.schemas import CamelModel
from app.features.categories.schemas import CategoryOut
from app.features.subtasks.schemas import SubtaskOut
from app.features.tasks.models import TaskPriority, TaskRecurrence, TaskStatus
from app.features.tasks.recurrence import is_valid_timezone

TaskSort = Literal[
    "createdAt", "-createdAt", "dueAt", "-dueAt", "priority", "-priority", "title", "-completedAt"
]


def _strip_title(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Title must not be blank")
    return v


def _check_timezone(v: str | None) -> str | None:
    if v is not None and not is_valid_timezone(v):
        raise ValueError("Unknown time zone")
    return v


class TaskCreate(CamelModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_at: AwareDatetime | None = None
    category_id: int | None = None
    recurrence: TaskRecurrence | None = None
    recurrence_interval: int = Field(default=1, ge=1, le=365)
    recurrence_timezone: str | None = Field(default=None, max_length=64)
    # Minutes before the due date (0 = at the due time); up to a week.
    remind_before_minutes: int | None = Field(default=None, ge=0, le=10080)

    strip_title = field_validator("title")(_strip_title)
    check_timezone = field_validator("recurrence_timezone")(_check_timezone)


class TaskUpdate(CamelModel):
    """Partial update: only fields present in the body are changed.

    description, dueAt, categoryId and recurrence may be sent as null to clear them.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: AwareDatetime | None = None
    category_id: int | None = None
    recurrence: TaskRecurrence | None = None
    recurrence_interval: int | None = Field(default=None, ge=1, le=365)
    recurrence_timezone: str | None = Field(default=None, max_length=64)
    remind_before_minutes: int | None = Field(default=None, ge=0, le=10080)

    strip_title = field_validator("title")(_strip_title)
    check_timezone = field_validator("recurrence_timezone")(_check_timezone)

    @field_validator("status", "priority", "title", "recurrence_interval")
    @classmethod
    def not_null(cls, v):
        if v is None:
            raise ValueError("Field cannot be null")
        return v


class TaskListQuery(CamelModel):
    status: TaskStatus | None = None
    # Only tasks that still need doing (status != done); used by the Today / Upcoming views.
    exclude_done: bool = False
    priority: TaskPriority | None = None
    category_id: int | None = None
    due_before: AwareDatetime | None = None
    due_after: AwareDatetime | None = None
    q: str | None = Field(default=None, max_length=200)
    sort: TaskSort = "-createdAt"
    page: int = Field(default=1, ge=1)
    # Up to 500 so a calendar month fits in one request.
    page_size: int = Field(default=20, ge=1, le=500)


class TaskOut(CamelModel):
    id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None
    completed_at: datetime | None
    category_id: int | None
    category: CategoryOut | None
    recurrence: TaskRecurrence | None
    recurrence_interval: int
    recurrence_timezone: str | None
    next_occurrence_id: int | None
    remind_before_minutes: int | None
    subtasks: list[SubtaskOut]
    created_at: datetime
    updated_at: datetime


class NextOccurrenceOut(CamelModel):
    """Returned in `meta.nextOccurrence` when completing a recurring task creates the next one."""

    id: int
    due_at: datetime
