from datetime import UTC, datetime
from typing import Any

from app.core.envelope import ApiError, not_found
from app.features.categories.repository import CategoryRepository
from app.features.notifications.models import NotificationType
from app.features.notifications.repository import NotificationRepository
from app.features.tasks.models import Task, TaskStatus
from app.features.tasks.recurrence import next_due_date
from app.features.tasks.repository import TaskRepository
from app.features.tasks.schemas import TaskCreate, TaskListQuery, TaskUpdate

# Fields that define a recurring series; changing any of them restarts it from the due date.
_SERIES_FIELDS = {"recurrence", "recurrence_interval", "recurrence_timezone", "due_at"}


def _validation_error(field: str, message: str) -> ApiError:
    return ApiError(
        422, "VALIDATION_ERROR", "Request validation failed", [{"field": field, "message": message}]
    )


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
        self._apply_series_rules(fields, current=None)
        self._check_reminder(fields, current=None)
        if fields["status"] == TaskStatus.DONE:
            fields["completed_at"] = datetime.now(UTC)
        return self.tasks.create(self.user_id, **fields)

    def update(self, task_id: int, payload: TaskUpdate) -> tuple[Task, Task | None]:
        """Apply a partial update. Returns the task and, if completing it created one, the next occurrence."""
        task = self.get(task_id)
        changes = payload.model_dump(exclude_unset=True)
        if "category_id" in changes:
            self._ensure_category(changes["category_id"])
        if _SERIES_FIELDS & changes.keys():
            # Forms resend every field; only re-anchor when the series really changed.
            reanchor = any(changes[k] != getattr(task, k) for k in _SERIES_FIELDS & changes.keys())
            self._apply_series_rules(changes, current=task, reanchor=reanchor)

        self._check_reminder(changes, current=task)

        became_done = changes.get("status", task.status) == TaskStatus.DONE and task.status != TaskStatus.DONE
        if "status" in changes and changes["status"] != task.status:
            changes["completed_at"] = datetime.now(UTC) if became_done else None

        if "due_at" in changes and changes["due_at"] != task.due_at:
            # Let the scheduler re-evaluate the task against its new due date.
            self.notifications.delete_for_task(task.id)
        elif changes.get("remind_before_minutes", task.remind_before_minutes) != task.remind_before_minutes:
            # A new reminder time means the reminder can fire again.
            self.notifications.delete_for_task(task.id, [NotificationType.REMINDER])

        task = self.tasks.update(task, **changes)
        next_task = self._create_next_occurrence(task) if became_done else None
        return task, next_task

    def delete(self, task_id: int) -> None:
        self.tasks.delete(self.get(task_id))

    def _apply_series_rules(
        self, fields: dict[str, Any], current: Task | None, reanchor: bool = True
    ) -> None:
        """Validate recurrence against the resulting due date and (re)anchor the series."""

        def value(name: str) -> Any:
            return fields[name] if name in fields else getattr(current, name, None)

        recurrence, due_at = value("recurrence"), value("due_at")
        if recurrence is None:
            fields["recurrence_anchor_at"] = None
            return
        if due_at is None:
            raise _validation_error("dueAt", "A due date is required for repeating tasks")
        if value("recurrence_timezone") is None:
            fields["recurrence_timezone"] = "UTC"
        if reanchor or value("recurrence_anchor_at") is None:
            fields["recurrence_anchor_at"] = due_at

    def _check_reminder(self, fields: dict[str, Any], current: Task | None) -> None:
        remind = fields["remind_before_minutes"] if "remind_before_minutes" in fields else getattr(current, "remind_before_minutes", None)
        due_at = fields["due_at"] if "due_at" in fields else getattr(current, "due_at", None)
        if remind is not None and due_at is None:
            raise _validation_error("dueAt", "A due date is required for reminders")

    def _create_next_occurrence(self, task: Task) -> Task | None:
        # next_occurrence_id guards against duplicates when a task is un-completed and completed again.
        if task.recurrence is None or task.due_at is None or task.next_occurrence_id is not None:
            return None
        due_at = next_due_date(
            anchor=task.recurrence_anchor_at or task.due_at,
            previous_due=task.due_at,
            recurrence=task.recurrence,
            interval=task.recurrence_interval,
            timezone=task.recurrence_timezone or "UTC",
            now=datetime.now(UTC),
        )
        next_task = self.tasks.create(
            self.user_id,
            title=task.title,
            description=task.description,
            priority=task.priority,
            category_id=task.category_id,
            status=TaskStatus.TODO,
            due_at=due_at,
            recurrence=task.recurrence,
            recurrence_interval=task.recurrence_interval,
            recurrence_timezone=task.recurrence_timezone,
            recurrence_anchor_at=task.recurrence_anchor_at or task.due_at,
            remind_before_minutes=task.remind_before_minutes,
        )
        self.tasks.update(task, next_occurrence_id=next_task.id)
        return next_task

    def _ensure_category(self, category_id: int | None) -> None:
        if category_id is None:
            return
        if self.categories.get_for_user(self.user_id, category_id) is None:
            raise _validation_error("categoryId", "Category does not exist")
