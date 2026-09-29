from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator

from app.core.schemas import CamelModel
from app.features.categories.schemas import CategoryOut
from app.features.tasks.models import TaskPriority, TaskStatus

TaskSort = Literal["createdAt", "-createdAt", "dueAt", "-dueAt", "priority", "-priority", "title"]


def _strip_title(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Title must not be blank")
    return v


class TaskCreate(CamelModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_at: AwareDatetime | None = None
    category_id: int | None = None

    strip_title = field_validator("title")(_strip_title)


class TaskUpdate(CamelModel):
    """Partial update: only fields present in the body are changed.

    description, dueAt and categoryId may be sent as null to clear them.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: AwareDatetime | None = None
    category_id: int | None = None

    strip_title = field_validator("title")(_strip_title)

    @field_validator("status", "priority", "title")
    @classmethod
    def not_null(cls, v):
        if v is None:
            raise ValueError("Field cannot be null")
        return v


class TaskListQuery(CamelModel):
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    category_id: int | None = None
    due_before: AwareDatetime | None = None
    due_after: AwareDatetime | None = None
    q: str | None = Field(default=None, max_length=200)
    sort: TaskSort = "-createdAt"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


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
    created_at: datetime
    updated_at: datetime
