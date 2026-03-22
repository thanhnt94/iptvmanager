import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from app.modules.channels.models import Channel, EPGSource
from app.core.database import db

class EPGService:
    @staticmethod
    def sync_epg(source_id):
        """Syncs EPG data from an XMLTV source."""
        source = EPGSource.query.get(source_id)
        if not source:
            return {'error': 'Source not found'}
            
        try:
            response = requests.get(source.url, timeout=30)
            response.raise_for_status()
            
            # Basic XML parsing for EPG (mapping check)
            # In a real app, this would be more complex and saved to an EPGData table
            # For now, we just update the source's last_sync_at
            source.last_sync_at = datetime.utcnow()
            db.session.commit()
            return {'status': 'success', 'last_sync': source.last_sync_at}
        except Exception as e:
            return {'error': str(e)}

class ChannelService:
    @staticmethod
    def get_all_channels(page=1, per_page=50, search=None, group_filter=None, stream_type_filter=None):
        query = Channel.query
        if search:
            # Try to search by ID if it's a number
            if search.isdigit():
                query = query.filter(db.or_(Channel.name.ilike(f'%{search}%'), Channel.id == int(search)))
            else:
                query = query.filter(Channel.name.ilike(f'%{search}%'))
        if group_filter:
            query = query.filter(Channel.group_name == group_filter)
        if stream_type_filter:
            query = query.filter(Channel.stream_type == stream_type_filter)
        return query.paginate(page=page, per_page=per_page, error_out=False)

    @staticmethod
    def get_distinct_groups():
        """Returns a list of all unique group names in the database."""
        groups = db.session.query(Channel.group_name).distinct().all()
        return [g[0] for g in groups if g[0]]

    @staticmethod
    def update_channel(channel_id, data):
        channel = Channel.query.get(channel_id)
        if not channel:
            return None
        
        channel.name = data.get('name', channel.name)
        channel.logo_url = data.get('logo_url', channel.logo_url)
        channel.group_name = data.get('group_name', channel.group_name)
        channel.epg_id = data.get('epg_id', channel.epg_id)
        channel.stream_url = data.get('stream_url', channel.stream_url)
        
        db.session.commit()
        return channel
