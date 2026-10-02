"""Fixed-window rate limiting backed by Postgres (no Redis needed at this scale).

Each counted action inserts a row keyed by e.g. "login:ip:1.2.3.4"; a check counts the rows
inside the window. A daily cleanup job deletes old rows.
"""

import math
from datetime import UTC, datetime, timedelta

from sqlalchemy import DateTime, String, delete, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.db import Base
from app.core.envelope import ApiError


class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(400), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )


class RateLimiter:
    def __init__(self, db: Session):
        self.db = db

    def check(self, key: str, *, limit: int, window: timedelta, now: datetime | None = None) -> None:
        """Raise 429 if `key` already has `limit` events inside the window."""
        now = now or datetime.now(UTC)
        since = now - window
        count, oldest = self.db.execute(
            select(func.count(), func.min(RateLimitEvent.created_at)).where(
                RateLimitEvent.key == key, RateLimitEvent.created_at > since
            )
        ).one()
        if count >= limit:
            retry_after = max(1, math.ceil((oldest + window - now).total_seconds()))
            raise ApiError(
                429,
                "TOO_MANY_REQUESTS",
                "Too many attempts. Try again later.",
                {"retryAfter": retry_after},
                headers={"Retry-After": str(retry_after)},
            )

    def hit(self, *keys: str, now: datetime | None = None) -> None:
        now = now or datetime.now(UTC)
        self.db.add_all(RateLimitEvent(key=key, created_at=now) for key in keys)
        self.db.commit()

    def reset(self, key: str) -> None:
        self.db.execute(delete(RateLimitEvent).where(RateLimitEvent.key == key))
        self.db.commit()

    def delete_older_than(self, cutoff: datetime) -> int:
        result = self.db.execute(delete(RateLimitEvent).where(RateLimitEvent.created_at < cutoff))
        self.db.commit()
        return result.rowcount
