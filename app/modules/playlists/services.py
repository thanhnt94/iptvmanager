"""
Playlist Service () — Uses injected Session, no Flask dependency.
"""
import secrets
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_

from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup, DiscoveryChannel
from app.modules.channels.models import Channel, EPGData, EPGSource

logger = logging.getLogger('iptv')


class PlaylistService:

    @staticmethod
    def create_profile(db: Session, name: str, slug: str) -> PlaylistProfile:
        token = secrets.token_hex(16)
        profile = PlaylistProfile(name=name, slug=slug, security_token=token)
        db.add(profile)
        db.commit()
        return profile

    @staticmethod
    def update_profile(db: Session, playlist_id: int, name=None, slug=None,
                       auto_scan_enabled=None, auto_scan_time=None):
        profile = db.query(PlaylistProfile).get(playlist_id)
        if not profile:
            return False, "Playlist not found"

        if not profile.is_system:
            if name:
                profile.name = name
            if slug:
                existing = db.query(PlaylistProfile).filter_by(slug=slug, owner_id=profile.owner_id).first()
                if existing and existing.id != profile.id:
                    return False, "Slug already in use"
                profile.slug = slug

        if auto_scan_enabled is not None:
            profile.auto_scan_enabled = bool(auto_scan_enabled)
        if auto_scan_time is not None:
            profile.auto_scan_time = str(auto_scan_time)

        db.commit()
        return True, profile

    @staticmethod
    def ensure_global_system_playlists(db: Session):
        pass

    @staticmethod
    def ensure_user_default_playlists(db: Session, user):
        pass

    @staticmethod
    def create_group(db: Session, playlist_id: int, name: str) -> PlaylistGroup:
        group = PlaylistGroup(playlist_id=playlist_id, name=name)
        db.add(group)
        db.commit()
        return group

    @staticmethod
    def add_channel_to_playlist(db: Session, playlist_id: int, channel_id: int,
                                group_id=None, new_group_name=None):
        if not group_id and new_group_name:
            existing_g = db.query(PlaylistGroup).filter_by(playlist_id=playlist_id, name=new_group_name).first()
            if existing_g:
                group_id = existing_g.id
            else:
                g = PlaylistGroup(playlist_id=playlist_id, name=new_group_name)
                db.add(g)
                db.commit()
                group_id = g.id

        existing_entry = db.query(PlaylistEntry).filter_by(playlist_id=playlist_id, channel_id=channel_id).first()
        if existing_entry:
            existing_entry.group_id = group_id
            db.commit()
            return existing_entry

        max_order = db.query(func.max(PlaylistEntry.order_index)).filter_by(playlist_id=playlist_id).scalar() or 0
        entry = PlaylistEntry(playlist_id=playlist_id, channel_id=channel_id, group_id=group_id, order_index=max_order + 1)
        db.add(entry)
        db.commit()
        return entry

    @staticmethod
    def batch_add_channels_to_playlist(db: Session, playlist_id: int, channel_ids: list, group_id=None) -> int:
        added = 0
        max_order = db.query(func.max(PlaylistEntry.order_index)).filter_by(playlist_id=playlist_id).scalar() or 0
        for cid in channel_ids:
            if not db.query(PlaylistEntry).filter_by(playlist_id=playlist_id, channel_id=cid).first():
                max_order += 1
                db.add(PlaylistEntry(playlist_id=playlist_id, channel_id=cid, group_id=group_id, order_index=max_order))
                added += 1
        db.commit()
        return added

    @staticmethod
    def reorder_entries(db: Session, playlist_id: int, entry_ids: list):
        for index, entry_id in enumerate(entry_ids):
            entry = db.query(PlaylistEntry).get(entry_id)
            if entry and entry.playlist_id == playlist_id:
                entry.order_index = index + 1
        db.commit()

    @staticmethod
    def update_entry_group(db: Session, entry_id: int, group_id):
        entry = db.query(PlaylistEntry).get(entry_id)
        if entry:
            entry.group_id = group_id if group_id else None
            db.commit()
            return True
        return False

    @staticmethod
    def delete_profile(db: Session, playlist_id: int):
        profile = db.query(PlaylistProfile).get(playlist_id)
        if not profile:
            return False, "Playlist not found"
        if profile.is_system:
            return False, "Cannot delete system playlist"
        db.delete(profile)
        db.commit()
        return True, "Playlist deleted"

    @staticmethod
    def generate_m3u(db: Session, playlist_id: int, base_url: str = "",
                     epg_url=None, hide_die=False, mode=None) -> str:
        """Generates M3U8 string for a playlist."""
        profile = db.query(PlaylistProfile).get(playlist_id)
        if not profile or not profile.is_active:
            return ""

        header = "#EXTM3U"
        if epg_url:
            header += f' x-tvg-url="{epg_url}" url-tvg="{epg_url}"'
        m3u_lines = [header]

        base = base_url.rstrip('/')

        def get_wrapped_url(ch, mode_override=None):
            m = mode_override or ch.proxy_type or 'default'
            if m == 'direct' or ch.is_passthrough or m == 'none':
                return ch.stream_url
            if m == 'tracking' or (m in ('default', 'smart') and ch.stream_url and '.flv' in ch.stream_url.lower()):
                return f"{base}/api/channels/track/{ch.id}"
            if m == 'hls':
                return f"{base}/api/channels/hls-manifest/{ch.id}/index.m3u8"
            return f"{base}/api/channels/play/{ch.id}"

        # Dynamic playlists
        if profile.is_dynamic:
            items = db.query(DiscoveryChannel).filter_by(playlist_id=playlist_id).order_by(DiscoveryChannel.id).all()
            for item in items:
                m3u_lines.append(f'#EXTINF:-1 tvg-name="{item.name}" group-title="Website Discovery",{item.name}')
                m3u_lines.append(item.stream_url)
            return "\n".join(m3u_lines)

        # System playlists
        if profile.is_system:
            query = db.query(Channel)
            if profile.owner_id:
                oid = int(profile.owner_id)
                from app.modules.auth.models import User
                owner_user = db.query(User).get(oid)
                owner_role = owner_user.role if owner_user else 'free'
                
                if "protected" in profile.slug:
                    query = query.filter(Channel.owner_id == oid, Channel.is_original == True)
                else:
                    if owner_role == 'free':
                        query = query.filter(Channel.owner_id == oid)
                    else:
                        query = query.filter(or_(Channel.owner_id == oid, Channel.is_public == True))
            else:
                query = query.filter_by(is_public=True)

            if hide_die:
                query = query.filter(or_(Channel.status != 'die', Channel.status == None))

            sort_logic = [
                case((Channel.owner_id == profile.owner_id, 0), else_=1).asc(),
                case((Channel.status == 'live', 0), (Channel.status == 'unknown', 1), (Channel.status == 'die', 2), else_=1).asc(),
                Channel.name.asc(),
            ]
            channels = query.order_by(*sort_logic).all()

            for ch in channels:
                if not ch:
                    continue
                ch_status = ch.status or 'unknown'
                ch_name = ch.name
                if ch_status == 'unknown':
                    ch_name = f"[Unknown] {ch.name}"
                elif not hide_die and ch_status == 'die':
                    ch_name = f"[Unavailable] {ch.name}"
                extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{ch.group_name or ""}",{ch_name}'
                m3u_lines.append(extinf)
                m3u_lines.append(get_wrapped_url(ch, mode))
        else:
            query_entries = db.query(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id)
            if profile.owner_id:
                from app.modules.auth.models import User
                owner_user = db.query(User).get(profile.owner_id)
                if owner_user and owner_user.role == 'free':
                    query_entries = query_entries.join(Channel).filter(Channel.owner_id == profile.owner_id)
            entries = query_entries.all()
            
            if not hide_die:
                priority = {'live': 0, 'unknown': 1, 'die': 2}
                entries = sorted(entries, key=lambda e: (
                    priority.get(getattr(e.channel, 'status', 'die') or 'die', 2),
                    e.channel.name if e.channel else '',
                ))

            for entry in entries:
                ch = entry.channel
                if not ch:
                    continue
                ch_status = ch.status or 'unknown'
                if hide_die and ch_status == 'die':
                    continue
                ch_name = entry.custom_name or ch.name
                if ch_status == 'unknown':
                    ch_name = f"[Unknown] {ch_name}"
                elif not hide_die and ch_status == 'die':
                    ch_name = f"[Unavailable] {ch_name}"
                group_name = entry.custom_group or (entry.group.name if entry.group else ch.group_name or "General")
                extinf = f'#EXTINF:-1 tvg-id="{ch.epg_id or ""}" tvg-logo="{ch.logo_url or ""}" group-title="{group_name}",{ch_name}'
                m3u_lines.append(extinf)
                m3u_lines.append(get_wrapped_url(ch, mode))

        return "\r\n".join(m3u_lines)

    @staticmethod
    def generate_xmltv(db: Session, playlist_id: int) -> str:
        profile = db.query(PlaylistProfile).get(playlist_id)
        if not profile:
            return ""

        root = ET.Element('tv')
        root.set('generator-info-name', 'IPTV Manager')
        epg_ids = set()

        if profile.is_system:
            query = db.query(Channel).filter(or_(Channel.status != 'die', Channel.status == None))
            if profile.owner_id:
                from app.modules.auth.models import User
                owner_user = db.query(User).get(profile.owner_id)
                owner_role = owner_user.role if owner_user else 'free'
                
                if "protected" in profile.slug:
                    query = query.filter_by(owner_id=profile.owner_id, is_original=True)
                else:
                    if owner_role == 'free':
                        query = query.filter(Channel.owner_id == profile.owner_id)
                    else:
                        query = query.filter(or_(Channel.owner_id == profile.owner_id, Channel.is_public == True))
            elif profile.slug == 'public':
                query = query.filter_by(is_public=True)
            for ch in query.all():
                if ch.epg_id:
                    epg_ids.add(ch.epg_id)
                    c_node = ET.SubElement(root, 'channel', id=ch.epg_id)
                    ET.SubElement(c_node, 'display-name').text = ch.name
                    if ch.logo_url:
                        ET.SubElement(c_node, 'icon', src=ch.logo_url)
        else:
            query_entries = db.query(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id)
            if profile.owner_id:
                from app.modules.auth.models import User
                owner_user = db.query(User).get(profile.owner_id)
                if owner_user and owner_user.role == 'free':
                    query_entries = query_entries.join(Channel).filter(Channel.owner_id == profile.owner_id)
            entries = query_entries.all()
            
            for entry in entries:
                ch = entry.channel
                if not ch or ch.status == 'die':
                    continue
                if ch.epg_id:
                    epg_ids.add(ch.epg_id)
                    c_node = ET.SubElement(root, 'channel', id=ch.epg_id)
                    ET.SubElement(c_node, 'display-name').text = entry.custom_name or ch.name
                    if ch.logo_url:
                        ET.SubElement(c_node, 'icon', src=ch.logo_url)

        if epg_ids:
            now = datetime.utcnow()
            start_limit = now - timedelta(days=1)
            programs = db.query(EPGData).filter(
                EPGData.epg_id.in_(epg_ids),
                EPGData.stop >= start_limit,
                or_(EPGData.owner_id == profile.owner_id, EPGData.owner_id == None),
            ).all()
            sources = {s.id: s.priority for s in db.query(EPGSource).all()}
            best = {}
            for p in programs:
                pri = 10000 if p.owner_id == profile.owner_id else sources.get(p.source_id, -1)
                key = (p.epg_id, p.start)
                if key not in best or pri > best[key][0]:
                    best[key] = (pri, p)
            for _, p in sorted(best.values(), key=lambda x: x[1].start):
                pn = ET.SubElement(root, 'programme', {
                    'start': p.start.strftime('%Y%m%d%H%M%S +0000'),
                    'stop': p.stop.strftime('%Y%m%d%H%M%S +0000'),
                    'channel': p.epg_id,
                })
                ET.SubElement(pn, 'title', lang='vi').text = p.title
                if p.desc:
                    ET.SubElement(pn, 'desc', lang='vi').text = p.desc

        return ET.tostring(root, encoding='unicode', method='xml')

    @staticmethod
    def create_dynamic_profile(db: Session, name, website_url, scanner_type, owner_id):
        token = secrets.token_hex(16)
        slug = f"dynamic-{secrets.token_hex(4)}"
        profile = PlaylistProfile(
            name=name, slug=slug, website_url=website_url, scanner_type=scanner_type,
            is_dynamic=True, owner_id=owner_id, security_token=token,
        )
        db.add(profile)
        db.commit()
        return profile

    @staticmethod
    def bulk_save_raw_channels(db: Session, playlist_id: int, channels_data: list, owner_id: int) -> int:
        added = 0
        playlist = db.query(PlaylistProfile).get(playlist_id)
        if not playlist:
            return 0
        existing_urls = {u[0] for u in db.query(Channel.stream_url).join(
            PlaylistEntry, PlaylistEntry.channel_id == Channel.id
        ).filter(PlaylistEntry.playlist_id == playlist_id).all()}

        for data in channels_data:
            name = data.get('name')
            url = data.get('stream_url')
            if not name or not url or url in existing_urls:
                continue
            channel = db.query(Channel).filter_by(stream_url=url).first()
            if not channel:
                channel = Channel(name=name, stream_url=url, owner_id=owner_id, is_public=False, status='unknown')
                db.add(channel)
                db.flush()
            db.add(PlaylistEntry(playlist_id=playlist_id, channel_id=channel.id, order_index=len(playlist.entries) + 1))
            added += 1
            existing_urls.add(url)
        db.commit()
        return added

