"""add show_watermark to tv channels

Revision ID: 964b065f21ec
Revises: c6531d33b602
Create Date: 2026-05-30 10:13:56.171773

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '964b065f21ec'
down_revision: Union[str, Sequence[str], None] = 'c6531d33b602'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    try:
        op.add_column('tv_channels', sa.Column('show_watermark', sa.Boolean(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tv_channels', 'show_watermark')
