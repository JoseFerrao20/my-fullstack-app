from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import Envelope, ok
from app.core.schemas import CamelModel
from app.features.tags.repository import TagRepository

router = APIRouter(prefix="/tags", tags=["tags"])


class TagOut(CamelModel):
    id: int
    name: str
    task_count: int


@router.get("", response_model=Envelope[list[TagOut]])
def list_tags(user: CurrentUser, db: DbSession):
    """The user's tags, most used first (for filters and suggestions).

    Tags are created by setting them on tasks and disappear when no task uses them.
    """
    rows = TagRepository(db).list_with_counts(user.id)
    return ok([TagOut(id=tag.id, name=tag.name, task_count=n) for tag, n in rows])
