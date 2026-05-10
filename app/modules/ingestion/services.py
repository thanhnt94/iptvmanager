"""
Ingestion Service  — import_channels with explicit Session.
parse_m3u8 stays unchanged (no DB dependency).
"""
import logging
from sqlalchemy.orm import Session

from app.modules.channels.models import Channel

logger = logging.getLogger('iptv')


class IngestionService:
    @staticmethod
    def import_channels(db: Session, channel_list: list, user_id: int = None, visibility='private') -> dict:
        """Imports channels with optimized deduplication and bulk insertion."""
        imported_count = 0
        skipped_count = 0

        is_public = (visibility == 'public')
        public_status = 'approved' if is_public else 'pending'

        existing_urls = {u[0] for u in db.query(Channel.stream_url).all()}

        for data in channel_list:
            if not data.get('stream_url'):
                continue
            if data['stream_url'] in existing_urls:
                skipped_count += 1
                continue

            stream_url = data['stream_url'].lower()
            stream_format = None
            if '.m3u8' in stream_url: stream_format = 'hls'
            elif '.mp4' in stream_url: stream_format = 'mp4'
            elif '.ts' in stream_url: stream_format = 'ts'
            elif '.mkv' in stream_url: stream_format = 'mkv'
            elif '.mp3' in stream_url: stream_format = 'mp3'

            new_channel = Channel(
                name=data.get('name', 'Unknown'),
                logo_url=data.get('logo_url'),
                group_name=data.get('group_name'),
                stream_url=data['stream_url'],
                stream_format=stream_format,
                epg_id=data.get('epg_id'),
                status='unknown',
                owner_id=user_id,
                is_public=is_public,
                public_status=public_status,
            )
            db.add(new_channel)
            existing_urls.add(data['stream_url'])
            imported_count += 1

        db.commit()
        return {'imported': imported_count, 'skipped': skipped_count}

