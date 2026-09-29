from datetime import datetime

from pydantic import Field, field_validator

from app.core.schemas import CamelModel

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


def _strip_name(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Name must not be blank")
    return v


class CategoryCreate(CamelModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#6366f1", pattern=HEX_COLOR)

    strip_name = field_validator("name")(_strip_name)


class CategoryUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(default=None, pattern=HEX_COLOR)

    strip_name = field_validator("name")(_strip_name)


class CategoryOut(CamelModel):
    id: int
    name: str
    color: str
    created_at: datetime
