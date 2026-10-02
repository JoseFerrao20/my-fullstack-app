from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.features.tags.models import Tag
from app.features.tasks.models import Task, TaskStatus
from app.features.tasks.schemas import TaskListQuery

_SORT_COLUMNS = {
    "createdAt": Task.created_at,
    "dueAt": Task.due_at,
    "priority": Task.priority,
    "title": Task.title,
    "completedAt": Task.completed_at,
}


class TaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_for_user(self, user_id: int, query: TaskListQuery) -> tuple[list[Task], int]:
        stmt = select(Task).where(Task.user_id == user_id, Task.deleted_at.is_(None))
        if query.tag:
            stmt = stmt.where(Task.tags.any(func.lower(Tag.name) == query.tag.strip().lstrip("@#").lower()))
        if query.status:
            stmt = stmt.where(Task.status == query.status)
        if query.exclude_done:
            stmt = stmt.where(Task.status != TaskStatus.DONE)
        if query.priority:
            stmt = stmt.where(Task.priority == query.priority)
        if query.category_id is not None:
            stmt = stmt.where(Task.category_id == query.category_id)
        if query.due_before:
            stmt = stmt.where(Task.due_at < query.due_before)
        if query.due_after:
            stmt = stmt.where(Task.due_at >= query.due_after)
        if query.q:
            pattern = f"%{query.q}%"
            stmt = stmt.where(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))

        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

        descending = query.sort.startswith("-")
        column = _SORT_COLUMNS[query.sort.lstrip("-")]
        order = column.desc() if descending else column.asc()
        stmt = (
            # Ties (e.g. same priority) fall back to the soonest due date, then newest first.
            stmt.order_by(order.nulls_last(), Task.due_at.asc().nulls_last(), Task.id.desc())
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
        )
        return list(self.db.scalars(stmt).unique()), total

    def get_for_user(self, user_id: int, task_id: int) -> Task | None:
        return self.db.scalar(
            select(Task).where(Task.id == task_id, Task.user_id == user_id, Task.deleted_at.is_(None))
        )

    # --- trash ---

    def get_trashed(self, user_id: int, task_id: int) -> Task | None:
        return self.db.scalar(
            select(Task).where(Task.id == task_id, Task.user_id == user_id, Task.deleted_at.is_not(None))
        )

    def list_trashed(self, user_id: int) -> list[Task]:
        return list(
            self.db.scalars(
                select(Task)
                .where(Task.user_id == user_id, Task.deleted_at.is_not(None))
                .order_by(Task.deleted_at.desc(), Task.id.desc())
            ).unique()
        )

    def empty_trash(self, user_id: int) -> int:
        result = self.db.execute(delete(Task).where(Task.user_id == user_id, Task.deleted_at.is_not(None)))
        self.db.commit()
        self.db.expire_all()
        return result.rowcount

    def purge_trashed_before(self, cutoff: datetime) -> int:
        result = self.db.execute(delete(Task).where(Task.deleted_at.is_not(None), Task.deleted_at < cutoff))
        self.db.commit()
        return result.rowcount

    def create(self, user_id: int, **fields: Any) -> Task:
        task = Task(user_id=user_id, **fields)
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def update(self, task: Task, **fields: Any) -> Task:
        for key, value in fields.items():
            setattr(task, key, value)
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete(self, task: Task) -> None:
        self.db.delete(task)
        self.db.commit()
