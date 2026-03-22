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
    def generate_m3u(playlist_id, epg_url=None):
        """Generates M3U8 string for a playlist."""
        from app.modules.playlists.models import PlaylistProfile
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile or not profile.is_active:
            return None
            
        header = "#EXTM3U"
        if epg_url:
            header += f' x-tvg-url="{epg_url}"'
        m3u_lines = [header]
        
        for entry in profile.entries:
            ch = entry.channel
            # Use group name from PlaylistGroup if linked, fallback to channel's original group
            group_name = entry.group.name if entry.group else ch.group_name or ""
            extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{group_name}",{ch.name}'
            m3u_lines.append(extinf)
            m3u_lines.append(ch.stream_url)
            
        return "\n".join(m3u_lines)

        db.session.commit()

    @staticmethod
    def generate_xmltv(playlist_id):
        """Generates XMLTV content for a playlist's channels."""
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.channels.models import EPGData
        from datetime import datetime, timedelta
        import xml.etree.ElementTree as ET

        profile = PlaylistProfile.query.get(playlist_id)
        if not profile: return ""

        root = ET.Element('tv')
        root.set('generator-info-name', 'IPTV Manager')

        # 1. Add <channel> entries
        epg_ids = set()
        for entry in profile.entries:
            ch = entry.channel
            if ch.epg_id:
                epg_ids.add(ch.epg_id)
                c_node = ET.SubElement(root, 'channel', id=ch.epg_id)
                ET.SubElement(c_node, 'display-name').text = ch.name
                if ch.logo_url:
                    ET.SubElement(c_node, 'icon', src=ch.logo_url)

        # 2. Add <programme> entries (last 24h to next 7 days)
        if epg_ids:
            now = datetime.utcnow()
            start_limit = now - timedelta(days=1)
            programs = EPGData.query.filter(
                EPGData.epg_id.in_(epg_ids),
                EPGData.stop >= start_limit
            ).order_by(EPGData.start).all()

            for p in programs:
                p_node = ET.SubElement(root, 'programme', {
                    'start': p.start.strftime('%Y%m%d%H%M%S +0000'),
                    'stop': p.stop.strftime('%Y%m%d%H%M%S +0000'),
                    'channel': p.epg_id
                })
                ET.SubElement(p_node, 'title', lang='vi').text = p.title
                if p.desc:
                    ET.SubElement(p_node, 'desc', lang='vi').text = p.desc

        # Return as string
        return ET.tostring(root, encoding='unicode', method='xml')

    @staticmethod
    def update_entry_group(entry_id, group_id):
        entry = PlaylistEntry.query.get(entry_id)
        if entry:
            entry.group_id = group_id
            db.session.commit()
            return True
        return False
