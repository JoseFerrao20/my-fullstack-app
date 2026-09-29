from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.core.deps import CurrentUser, DbSession
from app.core.envelope import ApiError, Envelope, ok
from app.core.security import REFRESH_COOKIE, clear_auth_cookies, decode_token, set_auth_cookies
from app.features.auth.repository import UserRepository
from app.features.auth.schemas import LoginIn, SignupIn, UserOut
from app.features.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _service(db: DbSession) -> AuthService:
    return AuthService(UserRepository(db))


@router.post("/signup", response_model=Envelope[UserOut], status_code=status.HTTP_201_CREATED)
def signup(payload: SignupIn, response: Response, db: DbSession):
    """Create an account and start a session (sets auth cookies)."""
    user = _service(db).signup(payload)
    set_auth_cookies(response, user.id)
    return ok(UserOut.model_validate(user))


@router.post("/login", response_model=Envelope[UserOut])
def login(payload: LoginIn, response: Response, db: DbSession):
    """Log in with email and password (sets auth cookies)."""
    user = _service(db).authenticate(payload)
    set_auth_cookies(response, user.id)
    return ok(UserOut.model_validate(user))


@router.post("/logout", response_model=Envelope[None])
def logout(response: Response):
    """Clear the auth cookies."""
    clear_auth_cookies(response)
    return ok(None)


@router.post("/refresh", response_model=Envelope[UserOut])
def refresh(
    response: Response,
    db: DbSession,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    """Issue fresh auth cookies from a valid refresh cookie."""
    user_id = decode_token(refresh_token, "refresh") if refresh_token else None
    user = UserRepository(db).get(user_id) if user_id is not None else None
    if user is None:
        clear_auth_cookies(response)
        raise ApiError(401, "UNAUTHORIZED", "Session expired")
    set_auth_cookies(response, user.id)
    return ok(UserOut.model_validate(user))


@router.get("/me", response_model=Envelope[UserOut])
def me(user: CurrentUser):
    """Return the logged-in user."""
    return ok(UserOut.model_validate(user))
