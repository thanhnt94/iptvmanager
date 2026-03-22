import secrets
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
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
    def create_group(playlist_id, name):
        group = PlaylistGroup(playlist_id=playlist_id, name=name)
        db.session.add(group)
        db.session.commit()
        return group

    @staticmethod
    def add_channel_to_playlist(playlist_id, channel_id, group_id=None):
        # Get max order_index
        max_order = db.session.query(db.func.max(PlaylistEntry.order_index))\
            .filter_by(playlist_id=playlist_id).scalar() or 0
        
        entry = PlaylistEntry(
            playlist_id=playlist_id, 
            channel_id=channel_id, 
            group_id=group_id,
            order_index=max_order + 1
        )
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
        
        for entry in profile.entries:
            ch = entry.channel
            # Use group name from PlaylistGroup if linked, fallback to channel's original group
            group_name = entry.group.name if entry.group else ch.group_name or ""
            extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{group_name}",{ch.name}'
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
