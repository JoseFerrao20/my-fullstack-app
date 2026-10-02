from app.core.envelope import ApiError, not_found
from app.features.subtasks.models import Subtask
from app.features.subtasks.repository import SubtaskRepository
from app.features.subtasks.schemas import SubtaskCreate, SubtaskOrder, SubtaskUpdate
from app.features.tasks.repository import TaskRepository

MAX_SUBTASKS = 50


class SubtaskService:
    def __init__(self, subtasks: SubtaskRepository, tasks: TaskRepository, user_id: int):
        self.subtasks = subtasks
        self.tasks = tasks
        self.user_id = user_id

    def _task_id(self, task_id: int) -> int:
        # Subtasks are only reachable through a task the user owns (404 otherwise).
        if self.tasks.get_for_user(self.user_id, task_id) is None:
            raise not_found("Task")
        return task_id

    def list_steps(self, task_id: int) -> list[Subtask]:
        return self.subtasks.list_for_task(self._task_id(task_id))

    def create(self, task_id: int, payload: SubtaskCreate) -> Subtask:
        task_id = self._task_id(task_id)
        if self.subtasks.count(task_id) >= MAX_SUBTASKS:
            raise ApiError(409, "TOO_MANY_SUBTASKS", f"A task can have at most {MAX_SUBTASKS} steps")
        return self.subtasks.create(task_id, payload.title)

    def update(self, task_id: int, subtask_id: int, payload: SubtaskUpdate) -> Subtask:
        subtask = self._get(task_id, subtask_id)
        return self.subtasks.update(subtask, **payload.model_dump(exclude_unset=True, exclude_none=True))

    def delete(self, task_id: int, subtask_id: int) -> None:
        self.subtasks.delete(self._get(task_id, subtask_id))

    def reorder(self, task_id: int, payload: SubtaskOrder) -> list[Subtask]:
        current = {s.id: s for s in self.subtasks.list_for_task(self._task_id(task_id))}
        if sorted(payload.ids) != sorted(current):
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "Request validation failed",
                [{"field": "ids", "message": "Must list every step of the task exactly once"}],
            )
        self.subtasks.reorder([current[i] for i in payload.ids])
        return self.subtasks.list_for_task(task_id)

    def _get(self, task_id: int, subtask_id: int) -> Subtask:
        subtask = self.subtasks.get(self._task_id(task_id), subtask_id)
        if subtask is None:
            raise not_found("Step")
        return subtask
