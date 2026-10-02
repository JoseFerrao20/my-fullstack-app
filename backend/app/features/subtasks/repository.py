from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.subtasks.models import Subtask


class SubtaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_for_task(self, task_id: int) -> list[Subtask]:
        return list(
            self.db.scalars(select(Subtask).where(Subtask.task_id == task_id).order_by(Subtask.position, Subtask.id))
        )

    def count(self, task_id: int) -> int:
        return self.db.scalar(select(func.count()).where(Subtask.task_id == task_id)) or 0

    def get(self, task_id: int, subtask_id: int) -> Subtask | None:
        return self.db.scalar(select(Subtask).where(Subtask.id == subtask_id, Subtask.task_id == task_id))

    def create(self, task_id: int, title: str, done: bool = False) -> Subtask:
        next_position = self.db.scalar(
            select(func.coalesce(func.max(Subtask.position) + 1, 0)).where(Subtask.task_id == task_id)
        )
        subtask = Subtask(task_id=task_id, title=title, done=done, position=next_position)
        self.db.add(subtask)
        self._commit()
        self.db.refresh(subtask)
        return subtask

    def update(self, subtask: Subtask, **fields: Any) -> Subtask:
        for key, value in fields.items():
            setattr(subtask, key, value)
        self._commit()
        self.db.refresh(subtask)
        return subtask

    def delete(self, subtask: Subtask) -> None:
        self.db.delete(subtask)
        self._commit()

    def reorder(self, subtasks_in_order: list[Subtask]) -> None:
        for position, subtask in enumerate(subtasks_in_order):
            subtask.position = position
        self._commit()

    def copy_unchecked(self, from_task_id: int, to_task_id: int) -> None:
        """For a recurring task's next occurrence: same steps, none done."""
        for position, subtask in enumerate(self.list_for_task(from_task_id)):
            self.db.add(Subtask(task_id=to_task_id, title=subtask.title, done=False, position=position))
        self._commit()

    def _commit(self) -> None:
        self.db.commit()
        # Tasks embed their checklist; make the next read of any task reload it.
        self.db.expire_all()
