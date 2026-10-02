from typing import Annotated

from fastapi import APIRouter, Cookie, Header, Response, status

from app.core.deps import ClientIp, CurrentUser, DbSession
from app.core.envelope import ApiError, Envelope, error_response, ok
from app.core.rate_limit import RateLimiter
from app.core.security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_access_cookie,
    set_refresh_cookie,
)
from app.features.auth.repository import SessionRepository, UserRepository
from app.features.auth.schemas import LoginIn, SignupIn, UserOut
from app.features.auth.service import AuthService, IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])

UserAgent = Annotated[str | None, Header()]
AccessCookie = Annotated[str | None, Cookie(alias=ACCESS_COOKIE)]
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _service(db: DbSession) -> AuthService:
    return AuthService(UserRepository(db), SessionRepository(db), RateLimiter(db))


def _set_cookies(response: Response, tokens: IssuedTokens) -> None:
    set_access_cookie(response, tokens.access)
    if tokens.refresh is not None:
        set_refresh_cookie(response, tokens.refresh)


@router.post("/signup", response_model=Envelope[UserOut], status_code=status.HTTP_201_CREATED)
def signup(payload: SignupIn, response: Response, db: DbSession, user_agent: UserAgent = None):
    """Create an account and start a session (sets auth cookies)."""
    service = _service(db)
    user = service.signup(payload)
    _set_cookies(response, service.start_session(user, user_agent))
    return ok(UserOut.model_validate(user))


@router.post("/login", response_model=Envelope[UserOut])
def login(payload: LoginIn, response: Response, db: DbSession, ip: ClientIp, user_agent: UserAgent = None):
    """Log in with email and password (sets auth cookies).

    Repeated failures return 429 with a Retry-After header.
    """
    service = _service(db)
    user = service.authenticate(payload, ip)
    _set_cookies(response, service.start_session(user, user_agent))
    return ok(UserOut.model_validate(user))


@router.post("/logout", response_model=Envelope[None])
def logout(response: Response, db: DbSession, access_token: AccessCookie = None, refresh_token: RefreshCookie = None):
    """End this session on the server and clear the auth cookies."""
    _service(db).end_session((access_token, "access"), (refresh_token, "refresh"))
    clear_auth_cookies(response)
    return ok(None)


@router.post("/logout-all", response_model=Envelope[None])
def logout_all(response: Response, db: DbSession, user: CurrentUser):
    """End every session of the current user, on all devices."""
    ended = _service(db).end_all_sessions(user.id)
    clear_auth_cookies(response)
    return ok(None, {"sessionsEnded": ended})


@router.post("/refresh", response_model=Envelope[UserOut])
def refresh(response: Response, db: DbSession, refresh_token: RefreshCookie = None):
    """Rotate the refresh cookie and issue a new access cookie."""
    try:
        tokens = _service(db).refresh_session(refresh_token)
    except ApiError as exc:
        # Build the error here: cookies set on `response` would be lost if we re-raised.
        error = error_response(exc.status_code, exc.code, str(exc.detail), exc.details)
        clear_auth_cookies(error)
        return error
    _set_cookies(response, tokens)
    return ok(UserOut.model_validate(tokens.session.user))


@router.get("/me", response_model=Envelope[UserOut])
def me(user: CurrentUser):
    """Return the logged-in user."""
    return ok(UserOut.model_validate(user))
