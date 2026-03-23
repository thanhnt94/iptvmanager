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
    def ensure_system_playlist():
        system_playlist = PlaylistProfile.query.filter_by(slug='alliptv').first()
        if not system_playlist:
            token = secrets.token_hex(16)
            system_playlist = PlaylistProfile(
                name='All IPTV Channels',
                slug='alliptv',
                is_system=True,
                security_token=token
            )
            db.session.add(system_playlist)
            db.session.commit()
        return system_playlist

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
    def generate_m3u(playlist_id, epg_url=None, token=None):
        """Generates M3U8 string for a playlist with wrapped playback URLs."""
        from flask import url_for
        from app.modules.playlists.models import PlaylistProfile
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile or not profile.is_active:
            return None
            
        header = "#EXTM3U"
        if epg_url:
            header += f' x-tvg-url="{epg_url}"'
        m3u_lines = [header]
        
        # Determine which channels to include
        if profile.is_system:
            # System playlist ONLY includes LIVE channels
            channels = Channel.query.filter_by(status='live').all()
            for ch in channels:
                extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{ch.group_name or ""}",{ch.name}'
                m3u_lines.append(extinf)
                # Wrap the stream URL
                wrapper_params = {'id': ch.id, '_external': True}
                if token: wrapper_params['token'] = token
                wrapper_url = url_for('channels.play_channel', **wrapper_params)
                m3u_lines.append(wrapper_url)
        else:
            # Regular playlist uses its entries
            for entry in profile.entries:
                ch = entry.channel
                if ch.status == 'die':
                    continue
                group_name = entry.group.name if entry.group else ch.group_name or ""
                extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{group_name}",{ch.name}'
                m3u_lines.append(extinf)
                # Wrap the stream URL
                wrapper_params = {'id': ch.id, '_external': True}
                if token: wrapper_params['token'] = token
                wrapper_url = url_for('channels.play_channel', **wrapper_params)
                m3u_lines.append(wrapper_url)
            
        return "\r\n".join(m3u_lines)

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
        
        if profile.is_system:
            # System playlist ONLY includes LIVE channels
            channels = Channel.query.filter_by(status='live').all()
            for ch in channels:
                if ch.epg_id:
                    epg_ids.add(ch.epg_id)
                    c_node = ET.SubElement(root, 'channel', id=ch.epg_id)
                    ET.SubElement(c_node, 'display-name').text = ch.name
                    if ch.logo_url:
                        ET.SubElement(c_node, 'icon', src=ch.logo_url)
        else:
            # Playlist entries (skipping dead ones)
            for entry in profile.entries:
                ch = entry.channel
                if ch.status == 'die':
                    continue
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
    def sync_channel_playlists(channel_id, playlist_data):
        """
        Syncs a channel's memberships across multiple playlists with specific group IDs.
        playlist_data: {playlist_id: group_id_or_none, ...}
        Adds for new IDs, removes for missing IDs, and updates group_id if changed.
        Skips system playlists to avoid accidental modification.
        """
        from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
        
        # Get all non-system entries for this channel
        existing_entries = PlaylistEntry.query.join(PlaylistProfile).filter(
            PlaylistEntry.channel_id == channel_id,
            PlaylistProfile.is_system == False
        ).all()
        
        existing_map = {e.playlist_id: e for e in existing_entries}
        # playlist_data might have string keys from form, convert to int
        target_playlists = {int(pid): gid for pid, gid in playlist_data.items() if pid}
        
        # 1. Remove entries for unselected playlists
        for pid in existing_map:
            if pid not in target_playlists:
                db.session.delete(existing_map[pid])
        
        # 2. Add or Update entries
        for pid, gid in target_playlists.items():
            gid_int = int(gid) if gid and str(gid).isdigit() else None
            
            if pid in existing_map:
                # Update group if changed
                entry = existing_map[pid]
                if entry.group_id != gid_int:
                    entry.group_id = gid_int
            else:
                # Add new entry
                max_order = db.session.query(db.func.max(PlaylistEntry.order_index))\
                    .filter_by(playlist_id=pid).scalar() or 0
                
                new_entry = PlaylistEntry(
                    channel_id=channel_id,
                    playlist_id=pid,
                    group_id=gid_int,
                    order_index=max_order + 1
                )
                db.session.add(new_entry)
        
        db.session.commit()

    @staticmethod
    def reorder_entries(playlist_id, entry_ids):
        """Updates the order_index for all entries in a playlist based on the new order."""
        for index, entry_id in enumerate(entry_ids):
            entry = PlaylistEntry.query.get(entry_id)
            if entry and entry.playlist_id == playlist_id:
                entry.order_index = index + 1
        db.session.commit()

    @staticmethod
    def update_entry_group(entry_id, group_id):
        """Updates the assigned group for a specific playlist entry."""
        entry = PlaylistEntry.query.get(entry_id)
        if entry:
            entry.group_id = group_id if group_id else None
            db.session.commit()
            return True
        return False

    @staticmethod
    def rename_group(group_id, new_name):
        """Updates the name of an existing playlist group."""
        group = PlaylistGroup.query.get(group_id)
        if group:
            group.name = new_name
            db.session.commit()
            return True
        return False
