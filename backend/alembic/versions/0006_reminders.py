"""reminders, notification preferences and push subscriptions

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # New enum values can't be used in the transaction that adds them; this one only adds it.
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reminder'")
    op.add_column("tasks", sa.Column("remind_before_minutes", sa.Integer(), nullable=True))

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("email_reminders", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("push_reminders", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("daily_digest", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("digest_hour", sa.Integer(), server_default="8", nullable=False),
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
        sa.Column("last_digest_on", sa.Date(), nullable=True),
    )

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(1000), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_table("notification_preferences")
    op.drop_column("tasks", "remind_before_minutes")
    # Postgres can't drop an enum value; 'reminder' rows are removed so the value is unused.
    op.execute("DELETE FROM notifications WHERE type = 'reminder'")
