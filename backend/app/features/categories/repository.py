from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.categories.models import Category


class CategoryRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_for_user(self, user_id: int) -> list[Category]:
        stmt = select(Category).where(Category.user_id == user_id).order_by(Category.name)
        return list(self.db.scalars(stmt))

    def get_for_user(self, user_id: int, category_id: int) -> Category | None:
        return self.db.scalar(
            select(Category).where(Category.id == category_id, Category.user_id == user_id)
        )

    def get_by_name(self, user_id: int, name: str) -> Category | None:
        return self.db.scalar(
            select(Category).where(
                Category.user_id == user_id, func.lower(Category.name) == name.lower()
            )
        )

    def create(self, user_id: int, **fields: Any) -> Category:
        category = Category(user_id=user_id, **fields)
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return category

    def update(self, category: Category, **fields: Any) -> Category:
        for key, value in fields.items():
            setattr(category, key, value)
        self.db.commit()
        self.db.refresh(category)
        return category

    def delete(self, category: Category) -> None:
        self.db.delete(category)
        self.db.commit()
