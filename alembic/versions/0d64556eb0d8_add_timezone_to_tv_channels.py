"""add timezone to tv_channels

Revision ID: 0d64556eb0d8
Revises: 964b065f21ec
Create Date: 2026-05-30 10:25:48.137323

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d64556eb0d8'
down_revision: Union[str, Sequence[str], None] = '964b065f21ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    try:
        op.add_column('tv_channels', sa.Column('timezone', sa.String(), nullable=False, server_default='Asia/Ho_Chi_Minh'))
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tv_channels', 'timezone')
