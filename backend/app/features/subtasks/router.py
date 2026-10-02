from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import Envelope, ok
from app.features.subtasks.repository import SubtaskRepository
from app.features.subtasks.schemas import SubtaskCreate, SubtaskOrder, SubtaskOut, SubtaskUpdate
from app.features.subtasks.service import SubtaskService
from app.features.tasks.repository import TaskRepository

router = APIRouter(prefix="/tasks/{task_id}/subtasks", tags=["subtasks"])


def _service(db: DbSession, user: CurrentUser) -> SubtaskService:
    return SubtaskService(SubtaskRepository(db), TaskRepository(db), user.id)


def _out(subtasks) -> list[SubtaskOut]:
    return [SubtaskOut.model_validate(s) for s in subtasks]


@router.get("", response_model=Envelope[list[SubtaskOut]])
def list_subtasks(task_id: int, db: DbSession, user: CurrentUser):
    """A task's checklist, in order. (Also embedded in every task as `subtasks`.)"""
    return ok(_out(_service(db, user).list_steps(task_id)))


@router.post("", response_model=Envelope[SubtaskOut], status_code=status.HTTP_201_CREATED)
def create_subtask(task_id: int, payload: SubtaskCreate, db: DbSession, user: CurrentUser):
    """Add a step at the end of the checklist (max 50 per task)."""
    return ok(SubtaskOut.model_validate(_service(db, user).create(task_id, payload)))


@router.patch("/{subtask_id}", response_model=Envelope[SubtaskOut])
def update_subtask(task_id: int, subtask_id: int, payload: SubtaskUpdate, db: DbSession, user: CurrentUser):
    """Rename a step or tick it off."""
    return ok(SubtaskOut.model_validate(_service(db, user).update(task_id, subtask_id, payload)))


@router.delete("/{subtask_id}", response_model=Envelope[None])
def delete_subtask(task_id: int, subtask_id: int, db: DbSession, user: CurrentUser):
    _service(db, user).delete(task_id, subtask_id)
    return ok(None)


@router.put("/order", response_model=Envelope[list[SubtaskOut]])
def reorder_subtasks(task_id: int, payload: SubtaskOrder, db: DbSession, user: CurrentUser):
    """Reorder the checklist: send every step id in the new order."""
    return ok(_out(_service(db, user).reorder(task_id, payload)))
