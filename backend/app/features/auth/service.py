from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.envelope import ApiError
from app.core.rate_limit import RateLimiter
from app.core.security import (
    TokenType,
    create_token,
    decode_token,
    hash_password,
    hash_token,
    new_session_id,
    verify_password,
)
from app.features.auth.models import AuthSession, User
from app.features.auth.repository import SessionRepository, UserRepository
from app.features.auth.schemas import LoginIn, ProfileUpdate, SignupIn

LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_LIMIT_PER_EMAIL_AND_IP = 5
LOGIN_LIMIT_PER_IP = 20
# Two tabs can refresh with the same cookie at once; the loser presents the just-rotated token.
REFRESH_GRACE = timedelta(seconds=30)


@dataclass(frozen=True)
class IssuedTokens:
    access: str
    # None when the browser already holds the current refresh token (grace-period refresh).
    refresh: str | None
    session: AuthSession


def _session_expired() -> ApiError:
    return ApiError(401, "UNAUTHORIZED", "Session expired")


class AuthService:
    def __init__(self, users: UserRepository, sessions: SessionRepository, limiter: RateLimiter):
        self.users = users
        self.sessions = sessions
        self.limiter = limiter

    def signup(self, payload: SignupIn) -> User:
        if self.users.get_by_email(payload.email):
            raise ApiError(409, "EMAIL_TAKEN", "An account with this email already exists")
        return self.users.create(
            email=payload.email,
            name=payload.name,
            hashed_password=hash_password(payload.password),
            locale=payload.locale,
        )

    def authenticate(self, payload: LoginIn, ip: str) -> User:
        """Check credentials. Only failures count toward the limits; success clears the email's."""
        email_key = f"login:email:{payload.email}:{ip}"
        ip_key = f"login:ip:{ip}"
        self.limiter.check(ip_key, limit=LOGIN_LIMIT_PER_IP, window=LOGIN_WINDOW)
        self.limiter.check(email_key, limit=LOGIN_LIMIT_PER_EMAIL_AND_IP, window=LOGIN_WINDOW)

        user = self.users.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.hashed_password):
            self.limiter.hit(email_key, ip_key)
            raise ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password")
        self.limiter.reset(email_key)
        return user

    def start_session(self, user: User, user_agent: str | None) -> IssuedTokens:
        session_id = new_session_id()
        refresh = create_token(user.id, session_id, "refresh")
        session = self.sessions.create(
            session_id=session_id,
            user_id=user.id,
            refresh_token_hash=hash_token(refresh),
            user_agent=(user_agent or "")[:300] or None,
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_ttl_days),
        )
        return IssuedTokens(create_token(user.id, session_id, "access"), refresh, session)

    def refresh_session(self, refresh_token: str | None) -> IssuedTokens:
        """Rotate the refresh token. Replaying an old one revokes the whole session."""
        now = datetime.now(UTC)
        claims = decode_token(refresh_token, "refresh") if refresh_token else None
        session = self.sessions.get_active(claims.session_id, now) if claims else None
        if claims is None or session is None or session.user_id != claims.user_id:
            raise _session_expired()

        presented = hash_token(refresh_token)
        if presented == session.refresh_token_hash:
            new_refresh = create_token(session.user_id, session.id, "refresh")
            self.sessions.rotate(session, hash_token(new_refresh), now)
            return IssuedTokens(create_token(session.user_id, session.id, "access"), new_refresh, session)

        in_grace = (
            presented == session.previous_refresh_token_hash
            and session.rotated_at is not None
            and now - session.rotated_at <= REFRESH_GRACE
        )
        if in_grace:
            self.sessions.touch(session, now)
            return IssuedTokens(create_token(session.user_id, session.id, "access"), None, session)

        # A rotated-out token came back: assume it was stolen and end the session.
        self.sessions.revoke(session.id, now)
        raise _session_expired()

    def end_session(self, *tokens: tuple[str | None, TokenType]) -> None:
        """Revoke the session named by whichever of (token, type) still decodes."""
        for token, token_type in tokens:
            claims = decode_token(token, token_type) if token else None
            if claims:
                self.sessions.revoke(claims.session_id, datetime.now(UTC))
                return

    def update_profile(self, user: User, payload: ProfileUpdate) -> User:
        return self.users.update(user, **payload.model_dump(exclude_unset=True))

    def end_all_sessions(self, user_id: int) -> int:
        return self.sessions.revoke_all_for_user(user_id, datetime.now(UTC))
