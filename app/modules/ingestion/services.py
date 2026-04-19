import re
import requests
import logging
from app.modules.channels.models import Channel
from app.core.database import db

logger = logging.getLogger('iptv')

class IngestionService:
    @staticmethod
    def parse_m3u8(content_or_url, is_url=False):
        """Parses M3U8/M3U content and returns a list of channel data dictionaries."""
        try:
            if is_url:
                logger.info(f"IngestionService: Fetching remote M3U8 from {content_or_url}")
                response = requests.get(content_or_url, timeout=15)
                response.raise_for_status()
                content = response.text
                logger.info(f"IngestionService: Successfully fetched {len(content)} bytes")
            else:
                content = content_or_url
            
            # Use manual parsing for better compatibility with IPTV lists
            channels = []
            lines = content.splitlines()
            current_channel = None
            
            logger.info(f"IngestionService: Parsing {len(lines)} lines")
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                    
                if line.startswith("#EXTINF"):
                    # Extract title (after last comma)
                    title = "Unknown Channel"
                    if ',' in line:
                        title = line.split(',')[-1].strip()
                    
                    # Regex for attributes
                    # Matches attribute="value"
                    attrs = dict(re.findall(r'(\S+?)="(.*?)"', line))
                    
                    current_channel = {
                        'name': title,
                        'logo_url': attrs.get('tvg-logo') or attrs.get('logo') or attrs.get('tvg-logo-url'),
                        'group_name': attrs.get('group-title') or attrs.get('group'),
                        'epg_id': attrs.get('tvg-id') or attrs.get('epg-id'),
                        'stream_url': None
                    }
                elif not line.startswith("#") and current_channel:
                    # Ignore lines that don't look like URLs
                    if ':' in line:
                        current_channel['stream_url'] = line
                        channels.append(current_channel)
                    current_channel = None
            
            logger.info(f"IngestionService: Found {len(channels)} valid stream candidates")
            return channels
        except Exception as e:
            logger.error(f"IngestionService: Parse error: {e}")
            return []

    @staticmethod
    def import_channels(channel_list, visibility='private'):
        """Imports channels with deduplication logic."""
        from flask_login import current_user
        imported_count = 0
        skipped_count = 0
        
        is_public = (visibility == 'public')
        public_status = 'approved' if is_public else 'pending'
        
        for data in channel_list:
            if not data.get('stream_url'):
                continue
                
            # Check if stream_url already exists
            existing = Channel.query.filter_by(stream_url=data['stream_url']).first()
            if existing:
                skipped_count += 1
                continue
                
            # Quick format detection from extension
            stream_url = data['stream_url'].lower()
            stream_format = None
            if '.m3u8' in stream_url: stream_format = 'hls'
            elif '.mp4' in stream_url: stream_format = 'mp4'
            elif '.ts' in stream_url: stream_format = 'ts'
            elif '.mkv' in stream_url: stream_format = 'mkv'
            elif '.mp3' in stream_url: stream_format = 'mp3'

            new_channel = Channel(
                name=data['name'],
                logo_url=data['logo_url'],
                group_name=data['group_name'],
                stream_url=data['stream_url'],
                stream_format=stream_format,
                epg_id=data['epg_id'],
                status='unknown',
                owner_id=current_user.id if current_user.is_authenticated else None,
                is_public=is_public,
                public_status=public_status
            )
            db.session.add(new_channel)
            imported_count += 1
            
        db.session.commit()
        return {'imported': imported_count, 'skipped': skipped_count}
