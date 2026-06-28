"""add_scan_queue

Revision ID: 79a24c76dc23
Revises: 0d64556eb0d8
Create Date: 2026-06-28 15:51:22.815824

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79a24c76dc23'
down_revision: Union[str, Sequence[str], None] = '0d64556eb0d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    try:
        op.create_table('scan_queue',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('channel_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['channel_id'], ['channels.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
    except Exception:
        pass

    with op.batch_alter_table('playlist_profiles', schema=None) as batch_op:
        batch_op.drop_column('auto_scan_interval')
        batch_op.drop_column('is_scanning')
        batch_op.drop_column('current_scanning_name')
        batch_op.drop_column('last_auto_scan_at')
        batch_op.drop_column('auto_scan_time')
        batch_op.drop_column('auto_scan_enabled')
        batch_op.drop_column('scanner_type')
        batch_op.drop_column('website_url')
        batch_op.drop_column('last_synced_at')

    try:
        op.drop_table('discovery_channels')
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('playlist_profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('last_synced_at', sa.DATETIME(), nullable=True))
        batch_op.add_column(sa.Column('website_url', sa.VARCHAR(length=512), nullable=True))
        batch_op.add_column(sa.Column('scanner_type', sa.VARCHAR(length=50), server_default=sa.text('("generic")'), nullable=True))
        batch_op.add_column(sa.Column('auto_scan_enabled', sa.BOOLEAN(), server_default=sa.text('0'), nullable=True))
        batch_op.add_column(sa.Column('auto_scan_time', sa.VARCHAR(length=5), server_default=sa.text('(NULL)'), nullable=True))
        batch_op.add_column(sa.Column('last_auto_scan_at', sa.DATETIME(), nullable=True))
        batch_op.add_column(sa.Column('current_scanning_name', sa.VARCHAR(length=255), nullable=True))
        batch_op.add_column(sa.Column('is_scanning', sa.BOOLEAN(), server_default=sa.text('0'), nullable=True))
        batch_op.add_column(sa.Column('auto_scan_interval', sa.INTEGER(), server_default=sa.text('(1440)'), nullable=True))

    op.drop_table('scan_queue')

