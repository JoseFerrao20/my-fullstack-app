import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt
from fastapi import Response

from app.core.config import get_settings

TokenType = Literal["access", "refresh"]

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"


@dataclass(frozen=True)
class TokenClaims:
    user_id: int
    session_id: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def hash_token(token: str) -> str:
    """Tokens are stored only as SHA-256 hashes, so a database leak doesn't hand out sessions."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_session_id() -> str:
    return secrets.token_hex(16)


def create_token(user_id: int, session_id: str, token_type: TokenType) -> str:
    settings = get_settings()
    ttl = (
        timedelta(minutes=settings.access_token_ttl_minutes)
        if token_type == "access"
        else timedelta(days=settings.refresh_token_ttl_days)
    )
    payload = {
        "sub": str(user_id),
        "sid": session_id,
        "type": token_type,
        # Unique per token, so every rotated refresh token has a distinct hash.
        "jti": secrets.token_urlsafe(16),
        "exp": datetime.now(UTC) + ttl,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> TokenClaims | None:
    """Return the claims if the token is valid and of the expected type, else None."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type or not isinstance(payload.get("sid"), str):
        return None
    try:
        return TokenClaims(user_id=int(payload["sub"]), session_id=payload["sid"])
    except (KeyError, ValueError):
        return None


def set_access_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        ACCESS_COOKIE,
        token,
        max_age=settings.access_token_ttl_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
