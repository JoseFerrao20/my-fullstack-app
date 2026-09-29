from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import Envelope, PageMeta, ok
from app.features.categories.repository import CategoryRepository
from app.features.notifications.repository import NotificationRepository
from app.features.tasks.repository import TaskRepository
from app.features.tasks.schemas import TaskCreate, TaskListQuery, TaskOut, TaskUpdate
from app.features.tasks.service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _service(db: DbSession, user: CurrentUser) -> TaskService:
    return TaskService(
        TaskRepository(db), CategoryRepository(db), NotificationRepository(db), user.id
    )


@router.get("", response_model=Envelope[list[TaskOut]])
def list_tasks(query: Annotated[TaskListQuery, Query()], db: DbSession, user: CurrentUser):
    """List the current user's tasks with filters, sorting and pagination."""
    tasks, total = _service(db, user).list(query)
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
    """Partially update a task. Send null for dueAt/categoryId/description to clear them."""
    return ok(TaskOut.model_validate(_service(db, user).update(task_id, payload)))


@router.delete("/{task_id}", response_model=Envelope[None])
def delete_task(task_id: int, db: DbSession, user: CurrentUser):
    _service(db, user).delete(task_id)
    return ok(None)
