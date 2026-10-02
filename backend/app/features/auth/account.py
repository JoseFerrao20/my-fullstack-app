"""Password reset, password change and account deletion."""

import secrets
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.email import Email
from app.core.envelope import ApiError
from app.core.rate_limit import RateLimiter
from app.core.security import hash_password, hash_token, verify_password
from app.features.auth.emails import password_changed_email, password_reset_email
from app.features.auth.models import AuthSession, User
from app.features.auth.repository import PasswordResetRepository, SessionRepository, UserRepository
from app.features.auth.schemas import (
    AccountDeleteIn,
    PasswordChangeIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
)

RESET_WINDOW = timedelta(hours=1)
RESET_LIMIT_PER_EMAIL = 3
RESET_LIMIT_PER_IP = 10
# Guessing the current password with a stolen session should be slow too.
PASSWORD_CHECK_WINDOW = timedelta(minutes=15)
PASSWORD_CHECK_LIMIT = 5


def _frontend_url(path: str) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}{path}"


def _wrong_password(field: str) -> ApiError:
    return ApiError(
        400,
        "INVALID_PASSWORD",
        "The password is incorrect",
        [{"field": field, "message": "The password is incorrect"}],
    )


class AccountService:
    def __init__(
        self,
        users: UserRepository,
        sessions: SessionRepository,
        resets: PasswordResetRepository,
        limiter: RateLimiter,
    ):
        self.users = users
        self.sessions = sessions
        self.resets = resets
        self.limiter = limiter

    def request_password_reset(self, payload: PasswordResetRequestIn, ip: str) -> Email | None:
        """Returns the email to send, or None when the address has no account.

        The caller answers the same way in both cases, so the endpoint doesn't reveal
        who has an account. Every request counts toward the limits, existing account or not.
        """
        email_key, ip_key = f"reset:email:{payload.email}", f"reset:ip:{ip}"
        self.limiter.check(ip_key, limit=RESET_LIMIT_PER_IP, window=RESET_WINDOW)
        self.limiter.check(email_key, limit=RESET_LIMIT_PER_EMAIL, window=RESET_WINDOW)
        self.limiter.hit(email_key, ip_key)

        user = self.users.get_by_email(payload.email)
        if user is None:
            return None

        now = datetime.now(UTC)
        ttl = get_settings().password_reset_ttl_minutes
        token = secrets.token_urlsafe(32)
        self.resets.create(
            user_id=user.id, token_hash=hash_token(token), expires_at=now + timedelta(minutes=ttl), now=now
        )
        return password_reset_email(
            to=user.email,
            name=user.name,
            link=_frontend_url(f"/reset-password?token={token}"),
            minutes=ttl,
            locale=user.locale or payload.locale,
        )

    def confirm_password_reset(self, payload: PasswordResetConfirmIn) -> Email:
        now = datetime.now(UTC)
        token = self.resets.get_usable(hash_token(payload.token), now)
        if token is None:
            raise ApiError(400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired")
        self.resets.mark_used(token, now)
        user = token.user
        self.users.update(user, hashed_password=hash_password(payload.new_password))
        # Whoever had the account open elsewhere (maybe the attacker) is logged out.
        self.sessions.revoke_all_for_user(user.id, now)
        return self._changed_email(user)

    def change_password(self, user: User, session: AuthSession, payload: PasswordChangeIn) -> Email:
        self._check_password(user, payload.current_password, "currentPassword")
        self.users.update(user, hashed_password=hash_password(payload.new_password))
        self.sessions.revoke_all_for_user(user.id, datetime.now(UTC), keep=session.id)
        return self._changed_email(user)

    def delete_account(self, user: User, payload: AccountDeleteIn) -> None:
        self._check_password(user, payload.password, "password")
        # Categories, tasks, notifications, sessions and reset tokens go with it (ON DELETE CASCADE).
        self.users.delete(user)

    def _check_password(self, user: User, password: str, field: str) -> None:
        key = f"password:user:{user.id}"
        self.limiter.check(key, limit=PASSWORD_CHECK_LIMIT, window=PASSWORD_CHECK_WINDOW)
        if not verify_password(password, user.hashed_password):
            self.limiter.hit(key)
            raise _wrong_password(field)

    def _changed_email(self, user: User) -> Email:
        return password_changed_email(
            to=user.email, name=user.name, forgot_link=_frontend_url("/forgot-password"), locale=user.locale
        )
