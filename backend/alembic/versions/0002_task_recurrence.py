"""task recurrence

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

task_recurrence = postgresql.ENUM(
    "daily", "weekly", "monthly", name="task_recurrence", create_type=False
)


def upgrade() -> None:
    task_recurrence.create(op.get_bind(), checkfirst=True)
    op.add_column("tasks", sa.Column("recurrence", task_recurrence, nullable=True))
    op.add_column(
        "tasks",
        sa.Column("recurrence_interval", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column("tasks", sa.Column("recurrence_timezone", sa.String(64), nullable=True))
    op.add_column(
        "tasks", sa.Column("recurrence_anchor_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "tasks",
        sa.Column(
            "next_occurrence_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="SET NULL", name="fk_tasks_next_occurrence_id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "next_occurrence_id")
    op.drop_column("tasks", "recurrence_anchor_at")
    op.drop_column("tasks", "recurrence_timezone")
    op.drop_column("tasks", "recurrence_interval")
    op.drop_column("tasks", "recurrence")
    task_recurrence.drop(op.get_bind(), checkfirst=True)
