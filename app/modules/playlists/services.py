import secrets
import time
import queue
import threading
import requests
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
    def update_profile(playlist_id, name=None, slug=None, auto_scan_enabled=None, auto_scan_time=None):
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile:
            return False, "Playlist not found"
        
        if profile.is_system:
            # Allow updating auto-scan for system playlists too if needed, but keep name/slug protected
            pass
        else:
            if name:
                profile.name = name
            if slug:
                # Check for slug uniqueness for this user
                existing = PlaylistProfile.query.filter_by(slug=slug, owner_id=profile.owner_id).first()
                if existing and existing.id != profile.id:
                    return False, "Slug already in use"
                profile.slug = slug
        
        if auto_scan_enabled is not None:
            profile.auto_scan_enabled = bool(auto_scan_enabled)
        
        if auto_scan_time is not None:
            profile.auto_scan_time = str(auto_scan_time)
            
        db.session.commit()
        return True, profile

    @staticmethod
    def ensure_global_system_playlists():
        """Ensures truly global system playlists (like Community Shared)."""
        # Community Shared Playlist
        public_playlist = PlaylistProfile.query.filter_by(slug='public').first()
        if not public_playlist:
            token = secrets.token_hex(16)
            public_playlist = PlaylistProfile(
                name='Hệ thống: Cộng đồng (Shared)',
                slug='public',
                is_system=True,
                security_token=token
            )
            db.session.add(public_playlist)
        db.session.commit()
        return public_playlist

    @staticmethod
    def ensure_user_default_playlists(user):
        """Creates the 'All' and 'Protected' personal system playlists for a user."""
        from app.modules.auth.models import User
        if not user: return

        # 1. All Channels (Personal)
        all_slug = f"user-{user.id}-all"
        all_playlist = PlaylistProfile.query.filter_by(slug=all_slug).first()
        if not all_playlist:
            all_playlist = PlaylistProfile(
                name='Tất cả kênh (Cá nhân)',
                slug=all_slug,
                is_system=True,
                owner_id=user.id,
                security_token=secrets.token_hex(16)
            )
            db.session.add(all_playlist)

        # 2. Protected Channels (Personal)
        protected_slug = f"user-{user.id}-protected"
        protected_playlist = PlaylistProfile.query.filter_by(slug=protected_slug).first()
        if not protected_playlist:
            protected_playlist = PlaylistProfile(
                name='Kênh Protected (Cá nhân)',
                slug=protected_slug,
                is_system=True,
                owner_id=user.id,
                security_token=secrets.token_hex(16)
            )
            db.session.add(protected_playlist)
        
        db.session.commit()

    @staticmethod
    def create_group(playlist_id, name):
        group = PlaylistGroup(playlist_id=playlist_id, name=name)
        db.session.add(group)
        db.session.commit()
        return group

    @staticmethod
    def add_channel_to_playlist(playlist_id, channel_id, group_id=None, new_group_name=None):
        # 1. Handle New Group Creation
        if not group_id and new_group_name:
            # Check if group already exists in this playlist
            existing_g = PlaylistGroup.query.filter_by(playlist_id=playlist_id, name=new_group_name).first()
            if existing_g:
                group_id = existing_g.id
            else:
                new_g = PlaylistGroup(playlist_id=playlist_id, name=new_group_name)
                db.session.add(new_g)
                db.session.commit()
                group_id = new_g.id

    @staticmethod
    def batch_add_channels_to_playlist(playlist_id, channel_ids, group_id=None):
        """Adds multiple channels to a playlist in bulk."""
        added_count = 0
        
        # Get current max order once
        max_order = db.session.query(db.func.max(PlaylistEntry.order_index))\
            .filter_by(playlist_id=playlist_id).scalar() or 0
            
        for cid in channel_ids:
            # Check for existing
            existing = PlaylistEntry.query.filter_by(playlist_id=playlist_id, channel_id=cid).first()
            if not existing:
                max_order += 1
                entry = PlaylistEntry(
                    playlist_id=playlist_id,
                    channel_id=cid,
                    group_id=group_id,
                    order_index=max_order
                )
                db.session.add(entry)
                added_count += 1
                
        db.session.commit()
        return added_count

    @staticmethod
    def add_channel_to_playlist(playlist_id, channel_id, group_id=None, new_group_name=None):
        # 1. Handle New Group Creation
        if not group_id and new_group_name:
            # Check if group already exists in this playlist
            existing_g = PlaylistGroup.query.filter_by(playlist_id=playlist_id, name=new_group_name).first()
            if existing_g:
                group_id = existing_g.id
            else:
                new_g = PlaylistGroup(playlist_id=playlist_id, name=new_group_name)
                db.session.add(new_g)
                db.session.commit()
                group_id = new_g.id

        # 2. Check for existing entry
        existing_entry = PlaylistEntry.query.filter_by(playlist_id=playlist_id, channel_id=channel_id).first()
        if existing_entry:
            existing_entry.group_id = group_id
            db.session.commit()
            return existing_entry

        # 3. Create New Entry
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
    def generate_m3u(playlist_id, epg_url=None, token=None, hide_die=False, mode=None):
        """Generates M3U8 string for a playlist with wrapped playback URLs."""
        from flask import url_for, current_app
        from app.modules.playlists.models import PlaylistProfile
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile or not profile.is_active:
            return None
            
        header = "#EXTM3U"
        if epg_url:
            header += f' x-tvg-url="{epg_url}" url-tvg="{epg_url}"'
        m3u_lines = [header]

        # Optimization: Pre-calculate base URLs to avoid calling url_for 45,000+ times
        # This makes generation O(N) string concat instead of O(N) heavy Flask routing
        # TOKENS REMOVED as requested by user
        token_suffix = ""
        
        # We use a dummy ID 999999999 to find the pattern and replace it
        dummy_id = 999999999
        url_track = url_for('channels.track_redirect', channel_id=dummy_id, _external=True).replace(str(dummy_id), "{cid}")
        url_play = url_for('channels.play_channel', channel_id=dummy_id, _external=True).replace(str(dummy_id), "{cid}")
        url_hls = url_for('channels.play_hls', channel_id=dummy_id, _external=True).replace(str(dummy_id), "{cid}")
        
        def get_wrapped_url(ch, mode_override=None):
            m = mode_override or ch.proxy_type or 'default'
            is_flv = ch.stream_url and '.flv' in ch.stream_url.lower().split('?')[0]
            
            if m == 'direct' or ch.is_passthrough or m == 'none':
                return ch.stream_url
            
            target_template = url_play
            if m == 'tracking' or (m == 'default' and is_flv) or (m == 'smart' and is_flv):
                target_template = url_track
            elif m == 'hls':
                target_template = url_hls
            
            return target_template.replace("{cid}", str(ch.id)) + token_suffix

        # Determine which channels to include
        if profile.is_dynamic:
            from app.modules.playlists.models import DiscoveryChannel
            discovery_items = DiscoveryChannel.query.filter_by(playlist_id=playlist_id).order_by(DiscoveryChannel.id.asc()).all()
            for item in discovery_items:
                # Direct links for discovery items as they are temporary/dynamic
                m3u_lines.append(f'#EXTINF:-1 tvg-name="{item.name}" group-title="Website Discovery",{item.name}')
                m3u_lines.append(item.stream_url)
            return "\n".join(m3u_lines)

        if profile.is_system:
            query = Channel.query
            if profile.owner_id:
                owner_id_int = int(profile.owner_id)
                if "protected" in profile.slug:
                    query = query.filter(Channel.owner_id == owner_id_int, Channel.is_original == True)
                else:
                    query = query.filter(db.or_(Channel.owner_id == owner_id_int, Channel.is_public == True))
            else:
                query = query.filter_by(is_public=True)
                
            if hide_die:
                query = query.filter(db.or_(Channel.status != 'die', Channel.status == None))
            
            # Diagnostic logging
            from flask import current_app
            current_app.logger.info(f"M3U Generation for {profile.slug}: Filters applied. Fetching channels...")
            
            from sqlalchemy import case
            # 1. Owner's channels first (0) vs Public (1)
            # 2. Status: Live (0) -> Unknown (1) -> Die (2)
            # 3. Name (A-Z)
            sort_logic = [
                case((Channel.owner_id == profile.owner_id, 0), else_=1).asc(),
                case((Channel.status == 'live', 0), (Channel.status == 'unknown', 1), (Channel.status == 'die', 2), else_=1).asc(),
                Channel.name.asc()
            ]
            query = query.order_by(*sort_logic)
            
            channels = query.all()
            for channel_obj in channels:
                if not channel_obj: continue
                ch_status = getattr(channel_obj, 'status', 'unknown') or 'unknown'
                ch_name = channel_obj.name
                if ch_status == 'unknown':
                    ch_name = f"[Unknown] {channel_obj.name}"
                elif not hide_die and ch_status == 'die':
                    ch_name = f"[Unavailable] {channel_obj.name}"
                
                extinf = f'#EXTINF:-1 tvg-id="{channel_obj.epg_id or ""}" tvg-logo="{channel_obj.logo_url or ""}" group-title="{channel_obj.group_name or ""}",{ch_name}'
                m3u_lines.append(extinf)
                m3u_lines.append(get_wrapped_url(channel_obj, mode))
        else:
            entries = profile.entries
            if not hide_die:
                priority = {'live': 0, 'unknown': 1, 'die': 2}
                entries = sorted(entries, key=lambda e: (priority.get(getattr(e.channel, 'status', 'die') or 'die', 2), e.channel.name if e.channel else ''))
                
            for entry in entries:
                try:
                    channel_obj = entry.channel
                    if not channel_obj:
                        current_app.logger.warning(f"M3U: Skipping entry {entry.id} - missing channel")
                        continue
                    
                    ch_status = getattr(channel_obj, 'status', 'unknown') or 'unknown'
                    if hide_die and ch_status == 'die': 
                        continue
                        
                    ch_name = channel_obj.name
                    if ch_status == 'unknown':
                        ch_name = f"[Unknown] {channel_obj.name}"
                    elif not hide_die and ch_status == 'die':
                        ch_name = f"[Unavailable] {channel_obj.name}"
                        
                    group_name = entry.group.name if entry.group else channel_obj.group_name or ""
                    extinf = f'#EXTINF:-1 tvg-id="{channel_obj.epg_id or ""}" tvg-logo="{channel_obj.logo_url or ""}" group-title="{group_name}",{ch_name}'
                    m3u_lines.append(extinf)
                    m3u_lines.append(get_wrapped_url(channel_obj, mode))
                except Exception as e:
                    current_app.logger.error(f"M3U: Crash on entry {getattr(entry, 'id', '?')}: {e}")
                    continue
            
        return "\r\n".join(m3u_lines)

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
            # System playlist handling: Include live and unknown channels for EPG
            query = Channel.query.filter(db.or_(Channel.status != 'die', Channel.status == None))
            
            # 1. PERSONALized isolation
            if profile.owner_id:
                if "protected" in profile.slug:
                    query = query.filter_by(owner_id=profile.owner_id, is_original=True)
                else:
                    query = query.filter(db.or_(Channel.owner_id == profile.owner_id, Channel.is_public == True))
            # 2. GLOBAL isolation
            elif profile.slug == 'public':
                query = query.filter_by(is_public=True)
                
            channels = query.all()
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
                channel_obj = entry.channel
                if not channel_obj: continue
                if getattr(channel_obj, 'status', 'die') == 'die':
                    continue
                if channel_obj.epg_id:
                    epg_ids.add(channel_obj.epg_id)
                    c_node = ET.SubElement(root, 'channel', id=channel_obj.epg_id)
                    ET.SubElement(c_node, 'display-name').text = channel_obj.name
                    if channel_obj.logo_url:
                        ET.SubElement(c_node, 'icon', src=channel_obj.logo_url)

        # 2. Add <programme> entries (last 24h to next 7 days)
        if epg_ids:
            from app.modules.channels.models import EPGSource
            now = datetime.utcnow()
            start_limit = now - timedelta(days=1)
            
            # Subquery or Join to get priorities
            # 1. Manual entries (owner_id is not null) => Priority 1000
            # 2. Source entries => Source priority
            
            # To handle this efficiently, we fetch all and rank in python
            programs = EPGData.query.filter(
                EPGData.epg_id.in_(epg_ids),
                EPGData.stop >= start_limit,
                db.or_(EPGData.owner_id == profile.owner_id, EPGData.owner_id == None)
            ).all()

            # Map source IDs to priorities
            sources = {s.id: s.priority for s in EPGSource.query.all()}
            
            # (epg_id, start_time) -> winning_program
            best_programs = {}
            
            for p in programs:
                priority = -1
                if p.owner_id == profile.owner_id:
                    priority = 10000  # Their manual always wins
                elif p.source_id in sources:
                    priority = sources[p.source_id]
                
                key = (p.epg_id, p.start)
                # Keep the one with higher priority
                if key not in best_programs or priority > best_programs[key][0]:
                    best_programs[key] = (priority, p)

            # Sort best programs by start time for XML output
            sorted_best = sorted([val[1] for val in best_programs.values()], key=lambda x: x.start)

            for p in sorted_best:
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
    def sync_channel_playlists(channel_id, playlist_data, new_groups_data=None):
        """
        Syncs a channel's memberships.
        playlist_data: {playlist_id: group_id_str, ...}
        new_groups_data: {playlist_id: new_group_name_str, ...}
        """
        from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
        
        # Get all non-system entries for this channel
        existing_entries = PlaylistEntry.query.join(PlaylistProfile).filter(
            PlaylistEntry.channel_id == channel_id,
            PlaylistProfile.is_system == False
        ).all()
        
        existing_map = {e.playlist_id: e for e in existing_entries}
        target_playlists = {int(pid): gid for pid, gid in playlist_data.items() if pid}
        new_groups = {int(pid): name for pid, name in (new_groups_data or {}).items() if pid and name}
        
        # 1. Remove entries for unselected playlists
        for pid in existing_map:
            if pid not in target_playlists:
                db.session.delete(existing_map[pid])
        
        # 2. Add or Update entries
        for pid in target_playlists:
            gid = target_playlists[pid]
            new_name = new_groups.get(pid)
            
            # Resolve group ID (prioritize existing select, then new name)
            final_gid = int(gid) if gid and str(gid).isdigit() else None
            if not final_gid and new_name:
                # Create or find the new group
                g = PlaylistGroup.query.filter_by(playlist_id=pid, name=new_name).first()
                if not g:
                    g = PlaylistGroup(playlist_id=pid, name=new_name)
                    db.session.add(g)
                    db.session.commit()
                final_gid = g.id

            if pid in existing_map:
                entry = existing_map[pid]
                if entry.group_id != final_gid:
                    entry.group_id = final_gid
            else:
                max_order = db.session.query(db.func.max(PlaylistEntry.order_index))\
                    .filter_by(playlist_id=pid).scalar() or 0
                new_entry = PlaylistEntry(
                    channel_id=channel_id,
                    playlist_id=pid,
                    group_id=final_gid,
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

    @staticmethod
    def create_dynamic_profile(name, website_url, scanner_type, owner_id):
        """Creates a new dynamic playlist linked to a website."""
        token = secrets.token_hex(16)
        slug = f"dynamic-{secrets.token_hex(4)}"
        profile = PlaylistProfile(
            name=name, 
            slug=slug, 
            website_url=website_url, 
            scanner_type=scanner_type,
            is_dynamic=True,
            owner_id=owner_id,
            security_token=token
        )
        db.session.add(profile)
        db.session.commit()
        return profile

    @staticmethod
    def sync_dynamic_playlist(playlist_id):
        """Triggers the background task to sync a dynamic playlist."""
        from app.modules.playlists.models import PlaylistProfile
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile or not profile.is_dynamic:
            return False, "Not a dynamic playlist"
        
        # Trigger Celery task
        from app.modules.channels.tasks import sync_dynamic_playlist_task
        sync_dynamic_playlist_task.delay(playlist_id)
        
        profile.is_scanning = True
        profile.current_scanning_name = "Initiating sync..."
        db.session.commit()
        return True, "Sync started"

    @staticmethod
    def bulk_save_raw_channels(playlist_id, channels_data, owner_id):
        """
        Takes raw channel data (name, stream_url), ensures channels exist in the DB,
        and adds them to the specified playlist.
        """
        from app.modules.channels.models import Channel
        from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
        
        added_count = 0
        playlist = PlaylistProfile.query.get(playlist_id)
        if not playlist:
            return 0

        # Get existing channel URLs in this playlist to avoid duplicates
        existing_urls = db.session.query(Channel.stream_url).join(
            PlaylistEntry, PlaylistEntry.channel_id == Channel.id
        ).filter(PlaylistEntry.playlist_id == playlist_id).all()
        existing_urls = {u[0] for u in existing_urls}

        for data in channels_data:
            name = data.get('name')
            url = data.get('stream_url')
            if not name or not url:
                continue
            
            if url in existing_urls:
                continue

            # Find or create channel
            channel = Channel.query.filter_by(stream_url=url).first()
            if not channel:
                channel = Channel(
                    name=name,
                    stream_url=url,
                    owner_id=owner_id,
                    is_public=False,
                    status='unknown'
                )
                db.session.add(channel)
                db.session.flush() # Get ID

            # Add to playlist
            entry = PlaylistEntry(
                playlist_id=playlist_id,
                channel_id=channel.id,
                order_index=len(playlist.entries) + 1
            )
            db.session.add(entry)
            added_count += 1
            existing_urls.add(url)

        db.session.commit()
        return added_count

    @staticmethod
    def delete_profile(playlist_id):
        """Deletes a playlist profile if it is not a system playlist."""
        profile = PlaylistProfile.query.get(playlist_id)
        if not profile:
            return False, "Playlist not found"
        if profile.is_system:
            return False, "Cannot delete system playlist"
        
        db.session.delete(profile)
        db.session.commit()
        return True, "Playlist deleted"
