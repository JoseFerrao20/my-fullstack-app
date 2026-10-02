from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Cookie, Header, Response, status

from app.core.deps import ClientIp, CurrentSession, CurrentUser, DbSession
from app.core.email import Mailer
from app.core.envelope import ApiError, Envelope, error_response, ok
from app.core.rate_limit import RateLimiter
from app.core.security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_access_cookie,
    set_refresh_cookie,
)
from app.features.auth.account import AccountService
from app.features.auth.repository import PasswordResetRepository, SessionRepository, UserRepository
from app.features.auth.schemas import (
    AccountDeleteIn,
    LoginIn,
    PasswordChangeIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    ProfileUpdate,
    SignupIn,
    UserOut,
)
from app.features.auth.service import AuthService, IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])

UserAgent = Annotated[str | None, Header()]
AccessCookie = Annotated[str | None, Cookie(alias=ACCESS_COOKIE)]
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _service(db: DbSession) -> AuthService:
    return AuthService(UserRepository(db), SessionRepository(db), RateLimiter(db))


def _account(db: DbSession) -> AccountService:
    return AccountService(UserRepository(db), SessionRepository(db), PasswordResetRepository(db), RateLimiter(db))


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


@router.patch("/me", response_model=Envelope[UserOut])
def update_me(payload: ProfileUpdate, user: CurrentUser, db: DbSession):
    """Update the profile. `locale` may be null to follow the browser language again."""
    return ok(UserOut.model_validate(_service(db).update_profile(user, payload)))


@router.post(
    "/password-reset/request", response_model=Envelope[None], status_code=status.HTTP_202_ACCEPTED
)
def request_password_reset(
    payload: PasswordResetRequestIn, db: DbSession, ip: ClientIp, mailer: Mailer, background: BackgroundTasks
):
    """Email a single-use reset link (valid 1 hour).

    Always answers 202, whether or not the address has an account, so it can't be used to
    find out who is registered.
    """
    email = _account(db).request_password_reset(payload, ip)
    if email is not None:
        background.add_task(mailer.send, email)
    return ok(None)


@router.post("/password-reset/confirm", response_model=Envelope[None])
def confirm_password_reset(payload: PasswordResetConfirmIn, db: DbSession, mailer: Mailer, background: BackgroundTasks):
    """Set a new password from a reset link. Ends every session of the account."""
    background.add_task(mailer.send, _account(db).confirm_password_reset(payload))
    return ok(None)


@router.post("/password", response_model=Envelope[None])
def change_password(
    payload: PasswordChangeIn, user: CurrentUser, session: CurrentSession, db: DbSession, mailer: Mailer,
    background: BackgroundTasks,
):
    """Change the password. Other devices are logged out; this one stays logged in."""
    background.add_task(mailer.send, _account(db).change_password(user, session, payload))
    return ok(None)


@router.delete("/me", response_model=Envelope[None])
def delete_account(payload: AccountDeleteIn, response: Response, user: CurrentUser, db: DbSession):
    """Permanently delete the account and all its data. Requires the password."""
    _account(db).delete_account(user, payload)
    clear_auth_cookies(response)
    return ok(None)
