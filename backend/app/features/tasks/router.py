from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import Envelope, PageMeta, ok
from app.features.categories.repository import CategoryRepository
from app.features.notifications.repository import NotificationRepository
from app.features.tasks.repository import TaskRepository
from app.features.tasks.schemas import (
    NextOccurrenceOut,
    TaskCreate,
    TaskListQuery,
    TaskOut,
    TaskUpdate,
)
from app.features.tasks.service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _service(db: DbSession, user: CurrentUser) -> TaskService:
    return TaskService(
        TaskRepository(db), CategoryRepository(db), NotificationRepository(db), user.id
    )


@router.get("", response_model=Envelope[list[TaskOut]])
def list_tasks(query: Annotated[TaskListQuery, Query()], db: DbSession, user: CurrentUser):
    """List the current user's tasks with filters, sorting and pagination."""
    tasks, total = _service(db, user).list_tasks(query)
    return ok(
        [TaskOut.model_validate(t) for t in tasks],
        PageMeta(total=total, page=query.page, page_size=query.page_size),
    )


@router.post("", response_model=Envelope[TaskOut], status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession, user: CurrentUser):
    return ok(TaskOut.model_validate(_service(db, user).create(payload)))


@router.get("/{task_id}", response_model=Envelope[TaskOut])
def get_task(task_id: int, db: DbSession, user: CurrentUser):
    return ok(TaskOut.model_validate(_service(db, user).get(task_id)))


@router.patch("/{task_id}", response_model=Envelope[TaskOut])
def update_task(task_id: int, payload: TaskUpdate, db: DbSession, user: CurrentUser):
    """Partially update a task. Send null for dueAt/categoryId/description/recurrence to clear them.

    Completing a recurring task creates its next occurrence, returned in `meta.nextOccurrence`.
    """
    task, next_task = _service(db, user).update(task_id, payload)
    meta = None
    if next_task is not None:
        next_out = NextOccurrenceOut.model_validate(next_task)
        meta = {"nextOccurrence": next_out.model_dump(mode="json", by_alias=True)}
    return ok(TaskOut.model_validate(task), meta)


@router.delete("/{task_id}", response_model=Envelope[None])
def delete_task(task_id: int, db: DbSession, user: CurrentUser):
    """Move a task to the trash. It can be restored for 30 days, then it's deleted for good."""
    _service(db, user).delete(task_id)
    return ok(None)


@router.post("/{task_id}/restore", response_model=Envelope[TaskOut])
def restore_task(task_id: int, db: DbSession, user: CurrentUser):
    """Bring a task back from the trash."""
    return ok(TaskOut.model_validate(_service(db, user).restore(task_id)))


trash_router = APIRouter(prefix="/trash", tags=["tasks"])


@trash_router.get("", response_model=Envelope[list[TaskOut]])
def list_trash(db: DbSession, user: CurrentUser):
    """Trashed tasks, most recently deleted first."""
    return ok([TaskOut.model_validate(t) for t in _service(db, user).trash()])


@trash_router.delete("/{task_id}", response_model=Envelope[None])
def delete_forever(task_id: int, db: DbSession, user: CurrentUser):
    """Permanently delete one trashed task."""
    _service(db, user).delete_forever(task_id)
    return ok(None)


@trash_router.delete("", response_model=Envelope[None])
def empty_trash(db: DbSession, user: CurrentUser):
    """Permanently delete everything in the trash."""
    return ok(None, {"deleted": _service(db, user).empty_trash()})
