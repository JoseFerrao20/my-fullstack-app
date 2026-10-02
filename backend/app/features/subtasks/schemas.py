from pydantic import Field, field_validator

from app.core.schemas import CamelModel


def _strip(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Title must not be blank")
    return v


class SubtaskCreate(CamelModel):
    title: str = Field(min_length=1, max_length=200)

    strip_title = field_validator("title")(_strip)


class SubtaskUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    done: bool | None = None

    strip_title = field_validator("title")(_strip)


class SubtaskOrder(CamelModel):
    """All of the task's subtask ids, in the new order."""

    ids: list[int] = Field(max_length=500)


class SubtaskOut(CamelModel):
    id: int
    title: str
    done: bool
    position: int
