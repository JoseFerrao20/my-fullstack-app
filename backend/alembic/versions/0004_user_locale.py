"""user locale

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL = follow the browser language, so existing users aren't pinned to one.
    op.add_column("users", sa.Column("locale", sa.String(5), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "locale")
