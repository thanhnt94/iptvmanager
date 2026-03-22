import secrets
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry
from app.modules.channels.models import Channel
from app.core.database import db

class PlaylistService:
    @staticmethod
    def create_profile(name, slug):
        token = secrets.token_hex(16)
        profile = PlaylistProfile(name=name, slug=slug, security_token=token)
        db.session.add(profile)
        db.session.commit()
        return profile

    @staticmethod
    def add_channel_to_playlist(playlist_id, channel_id):
        # Get max order_index
        max_order = db.session.query(db.func.max(PlaylistEntry.order_index))\
            .filter_by(playlist_id=playlist_id).scalar() or 0
        
        entry = PlaylistEntry(playlist_id=playlist_id, channel_id=channel_id, order_index=max_order + 1)
        db.session.add(entry)
        db.session.commit()
        return entry

    @staticmethod
    def generate_m3u(playlist_id):
        """Generates M3U8 string for a playlist."""
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile or not profile.is_active:
            return None
            
        m3u_lines = ["#EXTM3U"]
        
        # Only export 'live' channels or those with unknown status (depending on policy)
        # For now, export all entries in the profile
        for entry in profile.entries:
            ch = entry.channel
            extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{ch.group_name or ""}",{ch.name}'
            m3u_lines.append(extinf)
            m3u_lines.append(ch.stream_url)
            
        return "\n".join(m3u_lines)

    @staticmethod
    def reorder_entries(playlist_id, entry_ids):
        """Reorders entries based on a list of IDs from the frontend."""
        for index, entry_id in enumerate(entry_ids):
            entry = PlaylistEntry.query.get(entry_id)
            if entry and entry.playlist_id == int(playlist_id):
                entry.order_index = index
        db.session.commit()
