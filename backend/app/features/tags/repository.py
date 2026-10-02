from sqlalchemy import delete, exists, func, select
from sqlalchemy.orm import Session

from app.features.tags.models import Tag, task_tags
from app.features.tasks.models import Task


class TagRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create(self, user_id: int, names: list[str]) -> list[Tag]:
        """Tags for these names (case-insensitive match), creating missing ones. No commit."""
        if not names:
            return []
        lowered = [n.lower() for n in names]
        existing = {
            t.name.lower(): t
            for t in self.db.scalars(select(Tag).where(Tag.user_id == user_id, func.lower(Tag.name).in_(lowered)))
        }
        tags = []
        for name in names:
            tag = existing.get(name.lower())
            if tag is None:
                tag = Tag(user_id=user_id, name=name)
                self.db.add(tag)
                existing[name.lower()] = tag
            tags.append(tag)
        return tags

    def delete_unused(self, user_id: int) -> None:
        """Drop tags no task uses anymore (no commit)."""
        self.db.execute(
            delete(Tag).where(
                Tag.user_id == user_id,
                ~exists().where(task_tags.c.tag_id == Tag.id),
            )
        )

    def list_with_counts(self, user_id: int) -> list[tuple[Tag, int]]:
        """Tags with how many live (not trashed) tasks use them, most used first."""
        count = (
            select(func.count())
            .select_from(task_tags.join(Task, Task.id == task_tags.c.task_id))
            .where(task_tags.c.tag_id == Tag.id, Task.deleted_at.is_(None))
            .scalar_subquery()
        )
        rows = self.db.execute(
            select(Tag, count.label("n")).where(Tag.user_id == user_id).order_by(count.desc(), func.lower(Tag.name))
        )
        return [(tag, n) for tag, n in rows]
