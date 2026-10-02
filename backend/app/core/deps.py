from datetime import UTC, datetime
from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.envelope import ApiError
from app.core.security import ACCESS_COOKIE, decode_token
from app.features.auth.models import AuthSession, User
from app.features.auth.repository import SessionRepository

DbSession = Annotated[Session, Depends(get_db)]


def get_current_session(
    db: DbSession,
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
) -> AuthSession:
    """The session behind the access cookie. Revoked or expired sessions are rejected at once."""
    claims = decode_token(access_token, "access") if access_token else None
    session = SessionRepository(db).get_active(claims.session_id, datetime.now(UTC)) if claims else None
    if session is None or session.user_id != claims.user_id:
        raise ApiError(401, "UNAUTHORIZED", "Not authenticated")
    return session


CurrentSession = Annotated[AuthSession, Depends(get_current_session)]


def get_current_user(session: CurrentSession) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def client_ip(request: Request) -> str:
    # uvicorn runs with --proxy-headers, so behind nginx this is the real client address.
    return request.client.host if request.client else "unknown"


ClientIp = Annotated[str, Depends(client_ip)]
