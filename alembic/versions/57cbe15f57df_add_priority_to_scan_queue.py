"""add_priority_to_scan_queue

Revision ID: 57cbe15f57df
Revises: 79a24c76dc23
Create Date: 2026-06-28 16:02:47.801445

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '57cbe15f57df'
down_revision: Union[str, Sequence[str], None] = '79a24c76dc23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    try:
        with op.batch_alter_table('scan_queue', schema=None) as batch_op:
            batch_op.add_column(sa.Column('priority', sa.Integer(), nullable=True, server_default='0'))
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    try:
        with op.batch_alter_table('scan_queue', schema=None) as batch_op:
            batch_op.drop_column('priority')
    except Exception:
        pass
