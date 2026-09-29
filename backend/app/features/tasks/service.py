from datetime import UTC, datetime

from app.core.envelope import ApiError, not_found
from app.features.categories.repository import CategoryRepository
from app.features.notifications.repository import NotificationRepository
from app.features.tasks.models import Task, TaskStatus
from app.features.tasks.repository import TaskRepository
from app.features.tasks.schemas import TaskCreate, TaskListQuery, TaskUpdate


class TaskService:
    def __init__(
        self,
        tasks: TaskRepository,
        categories: CategoryRepository,
        notifications: NotificationRepository,
        user_id: int,
    ):
        self.tasks = tasks
        self.categories = categories
        self.notifications = notifications
        self.user_id = user_id

    def list(self, query: TaskListQuery) -> tuple[list[Task], int]:
        return self.tasks.list_for_user(self.user_id, query)

    def get(self, task_id: int) -> Task:
        task = self.tasks.get_for_user(self.user_id, task_id)
        if task is None:
            raise not_found("Task")
        return task

    def create(self, payload: TaskCreate) -> Task:
        fields = payload.model_dump()
        self._ensure_category(fields.get("category_id"))
        if fields["status"] == TaskStatus.DONE:
            fields["completed_at"] = datetime.now(UTC)
        return self.tasks.create(self.user_id, **fields)

    def update(self, task_id: int, payload: TaskUpdate) -> Task:
        task = self.get(task_id)
        changes = payload.model_dump(exclude_unset=True)
        if "category_id" in changes:
            self._ensure_category(changes["category_id"])

        if "status" in changes and changes["status"] != task.status:
            changes["completed_at"] = (
                datetime.now(UTC) if changes["status"] == TaskStatus.DONE else None
            )

        if "due_at" in changes and changes["due_at"] != task.due_at:
            # Let the scheduler re-evaluate the task against its new due date.
            self.notifications.delete_for_task(task.id)

        return self.tasks.update(task, **changes)

    def delete(self, task_id: int) -> None:
        self.tasks.delete(self.get(task_id))

    def _ensure_category(self, category_id: int | None) -> None:
        if category_id is None:
            return
        if self.categories.get_for_user(self.user_id, category_id) is None:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "Request validation failed",
                [{"field": "categoryId", "message": "Category does not exist"}],
            )
