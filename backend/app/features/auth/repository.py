from datetime import datetime, timedelta

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.features.auth.models import AuthSession, PasswordResetToken, User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email))

    def create(self, *, email: str, name: str, hashed_password: str, locale: str | None = None) -> User:
        user = User(email=email, name=name, hashed_password=hashed_password, locale=locale)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user: User, **fields: object) -> User:
        for key, value in fields.items():
            setattr(user, key, value)
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete(self, user: User) -> None:
        # Core DELETE so the database's ON DELETE CASCADE removes everything the user owns.
        self.db.execute(delete(User).where(User.id == user.id))
        self.db.commit()
        self.db.expunge_all()


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        session_id: str,
        user_id: int,
        refresh_token_hash: str,
        user_agent: str | None,
        expires_at: datetime,
    ) -> AuthSession:
        session = AuthSession(
            id=session_id,
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            user_agent=user_agent,
            expires_at=expires_at,
        )
        self.db.add(session)
        self.db.commit()
        return session

    def get_active(self, session_id: str, now: datetime) -> AuthSession | None:
        return self.db.scalar(
            select(AuthSession).where(
                AuthSession.id == session_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
        )

    def rotate(self, session: AuthSession, new_hash: str, now: datetime) -> None:
        session.previous_refresh_token_hash = session.refresh_token_hash
        session.refresh_token_hash = new_hash
        session.rotated_at = now
        session.last_used_at = now
        self.db.commit()

    def touch(self, session: AuthSession, now: datetime) -> None:
        session.last_used_at = now
        self.db.commit()

    def revoke(self, session_id: str, now: datetime) -> None:
        self.db.execute(
            update(AuthSession)
            .where(AuthSession.id == session_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self.db.commit()

    def revoke_all_for_user(self, user_id: int, now: datetime, *, keep: str | None = None) -> int:
        stmt = update(AuthSession).where(
            AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
        )
        if keep is not None:
            stmt = stmt.where(AuthSession.id != keep)
        result = self.db.execute(stmt.values(revoked_at=now))
        self.db.commit()
        return result.rowcount

    def delete_stale(self, now: datetime, keep_revoked_for: timedelta) -> int:
        result = self.db.execute(
            delete(AuthSession).where(
                or_(
                    AuthSession.expires_at <= now,
                    AuthSession.revoked_at <= now - keep_revoked_for,
                )
            )
        )
        self.db.commit()
        return result.rowcount


class PasswordResetRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, *, user_id: int, token_hash: str, expires_at: datetime, now: datetime) -> None:
        # Only the newest link works: retire any earlier unused ones.
        self.db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=now)
        )
        self.db.add(PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at))
        self.db.commit()

    def get_usable(self, token_hash: str, now: datetime) -> PasswordResetToken | None:
        return self.db.scalar(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
        )

    def mark_used(self, token: PasswordResetToken, now: datetime) -> None:
        token.used_at = now
        self.db.commit()

    def delete_stale(self, now: datetime) -> int:
        result = self.db.execute(
            delete(PasswordResetToken).where(
                or_(PasswordResetToken.used_at.is_not(None), PasswordResetToken.expires_at <= now)
            )
        )
        self.db.commit()
        return result.rowcount
