from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import Envelope, ok
from app.features.categories.repository import CategoryRepository
from app.features.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.features.categories.service import CategoryService

router = APIRouter(prefix="/categories", tags=["categories"])


def _service(db: DbSession, user: CurrentUser) -> CategoryService:
    return CategoryService(CategoryRepository(db), user.id)


@router.get("", response_model=Envelope[list[CategoryOut]])
def list_categories(db: DbSession, user: CurrentUser):
    categories = _service(db, user).list_categories()
    return ok([CategoryOut.model_validate(c) for c in categories])


@router.post("", response_model=Envelope[CategoryOut], status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: DbSession, user: CurrentUser):
    return ok(CategoryOut.model_validate(_service(db, user).create(payload)))


@router.get("/{category_id}", response_model=Envelope[CategoryOut])
def get_category(category_id: int, db: DbSession, user: CurrentUser):
    return ok(CategoryOut.model_validate(_service(db, user).get(category_id)))


@router.patch("/{category_id}", response_model=Envelope[CategoryOut])
def update_category(category_id: int, payload: CategoryUpdate, db: DbSession, user: CurrentUser):
    return ok(CategoryOut.model_validate(_service(db, user).update(category_id, payload)))


@router.delete("/{category_id}", response_model=Envelope[None])
def delete_category(category_id: int, db: DbSession, user: CurrentUser):
    """Delete a category. Its tasks are kept and become uncategorized."""
    _service(db, user).delete(category_id)
    return ok(None)
