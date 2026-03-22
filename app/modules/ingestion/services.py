import re
import requests
from app.modules.channels.models import Channel
from app.core.database import db

class IngestionService:
    @staticmethod
    def parse_m3u8(content_or_url, is_url=False):
        """Parses M3U8/M3U content and returns a list of channel data dictionaries."""
        try:
            if is_url:
                response = requests.get(content_or_url, timeout=10)
                response.raise_for_status()
                content = response.text
            else:
                content = content_or_url
            
            # Use manual parsing for better compatibility with IPTV lists
            channels = []
            lines = content.splitlines()
            current_channel = None
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                    
                if line.startswith("#EXTINF"):
                    # Extract title (after last comma)
                    title = "Unknown"
                    if ',' in line:
                        title = line.split(',')[-1].strip()
                    
                    # Regex for attributes
                    # Matches attribute="value"
                    attrs = dict(re.findall(r'(\S+?)="(.*?)"', line))
                    
                    current_channel = {
                        'name': title,
                        'logo_url': attrs.get('tvg-logo') or attrs.get('logo'),
                        'group_name': attrs.get('group-title') or attrs.get('group'),
                        'epg_id': attrs.get('tvg-id') or attrs.get('epg-id'),
                        'stream_url': None
                    }
                elif not line.startswith("#") and current_channel:
                    current_channel['stream_url'] = line
                    channels.append(current_channel)
                    current_channel = None
                    
            return channels
        except Exception as e:
            print(f"Error parsing M3U: {e}")
            return []

    @staticmethod
    def import_channels(channel_list):
        """Imports channels with deduplication logic."""
        imported_count = 0
        skipped_count = 0
        
        for data in channel_list:
            if not data.get('stream_url'):
                continue
                
            # Check if stream_url already exists
            existing = Channel.query.filter_by(stream_url=data['stream_url']).first()
            if existing:
                skipped_count += 1
                continue
                
            new_channel = Channel(
                name=data['name'],
                logo_url=data['logo_url'],
                group_name=data['group_name'],
                stream_url=data['stream_url'],
                epg_id=data['epg_id'],
                status='unknown'
            )
            db.session.add(new_channel)
            imported_count += 1
            
        db.session.commit()
        return {'imported': imported_count, 'skipped': skipped_count}
