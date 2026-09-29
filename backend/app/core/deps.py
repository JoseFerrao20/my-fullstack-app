from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.envelope import ApiError
from app.core.security import ACCESS_COOKIE, decode_token
from app.features.auth.models import User
from app.features.auth.repository import UserRepository

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
) -> User:
    user_id = decode_token(access_token, "access") if access_token else None
    user = UserRepository(db).get(user_id) if user_id is not None else None
    if user is None:
        raise ApiError(401, "UNAUTHORIZED", "Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
