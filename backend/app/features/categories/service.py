from app.core.envelope import ApiError, not_found
from app.features.categories.models import Category
from app.features.categories.repository import CategoryRepository
from app.features.categories.schemas import CategoryCreate, CategoryUpdate


class CategoryService:
    def __init__(self, repo: CategoryRepository, user_id: int):
        self.repo = repo
        self.user_id = user_id

    def list(self) -> list[Category]:
        return self.repo.list_for_user(self.user_id)

    def get(self, category_id: int) -> Category:
        category = self.repo.get_for_user(self.user_id, category_id)
        if category is None:
            raise not_found("Category")
        return category

    def create(self, payload: CategoryCreate) -> Category:
        self._ensure_unique_name(payload.name)
        return self.repo.create(self.user_id, **payload.model_dump())

    def update(self, category_id: int, payload: CategoryUpdate) -> Category:
        category = self.get(category_id)
        changes = payload.model_dump(exclude_unset=True, exclude_none=True)
        if "name" in changes and changes["name"].lower() != category.name.lower():
            self._ensure_unique_name(changes["name"])
        return self.repo.update(category, **changes)

    def delete(self, category_id: int) -> None:
        # Tasks keep existing: the FK is ON DELETE SET NULL.
        self.repo.delete(self.get(category_id))

    def _ensure_unique_name(self, name: str) -> None:
        if self.repo.get_by_name(self.user_id, name):
            raise ApiError(409, "CATEGORY_EXISTS", f"A category named '{name}' already exists")
