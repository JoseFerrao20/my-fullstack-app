from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class NotificationPreferences(Base):
    """How a user wants to be reminded. A missing row means the defaults below."""

    __tablename__ = "notification_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    email_reminders: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    push_reminders: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    daily_digest: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Local hour (0-23) in `timezone` at which the digest goes out.
    digest_hour: Mapped[int] = mapped_column(Integer, default=8, server_default="8")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    # Local date of the last digest, so it's sent at most once a day.
    last_digest_on: Mapped[date | None] = mapped_column(Date)


class PushSubscription(Base):
    """One browser/device that accepted push notifications."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(1000), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
