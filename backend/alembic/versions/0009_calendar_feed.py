"""calendar feed token

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("calendar_feed_token_hash", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("calendar_feed_created_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("users_calendar_feed_token_hash_key", "users", ["calendar_feed_token_hash"])


def downgrade() -> None:
    op.drop_constraint("users_calendar_feed_token_hash_key", "users", type_="unique")
    op.drop_column("users", "calendar_feed_created_at")
    op.drop_column("users", "calendar_feed_token_hash")
