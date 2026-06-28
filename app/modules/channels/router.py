"""
Channels Router () — FastAPI, no Flask dependency.
Handles: Channel CRUD, Proxy/HLS/TS streaming, batch operations, sharing, playback.
"""
import logging
import time
import queue
import re
import httpx
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from fastapi.responses import StreamingResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.core.database import get_db
from app.core.auth_deps import login_required, admin_required, get_current_user
from app.modules.auth.models import User
from app.modules.channels.models import Channel, ChannelShare
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup

logger = logging.getLogger('iptv')

router = APIRouter()


@router.post("/extract")
async def extract_media_link(
    data: dict = Body(...),
    user: User = Depends(login_required),
):
    url = data.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": url
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
            resp = await client.get(url)
            html = resp.text
            
            patterns = [
                r'(https?://[^\s"\']+\.m3u8[^\s"\']*)',
                r'(https?://[^\s"\']+\.mp4[^\s"\']*)',
                r'(https?://[^\s"\']+\.ts[^\s"\']*)',
                r'(https?:\\/\\/[^\s"\']+\.m3u8[^\s"\']*)',
            ]
            
            found_urls = []
            for pattern in patterns:
                for match in re.findall(pattern, html, re.IGNORECASE):
                    cleaned = match.replace('\\/', '/')
                    if cleaned not in found_urls:
                        found_urls.append(cleaned)
            
            return {"status": "success", "urls": found_urls}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch or extract: {str(e)}")


# --- Helper ---

def _channel_to_dict(ch: Channel) -> dict:
    return {
        'id': ch.id,
        'name': ch.name,
        'logo_url': ch.logo_url,
        'group_name': ch.group_name,
        'stream_url': ch.stream_url,
        'epg_id': ch.epg_id,
        'status': ch.status,
        'stream_type': ch.stream_type,
        'stream_format': ch.stream_format or 'ts',
        'play_url': f"/api/channels/play/{ch.id}",
        'play_links': {
            'original': ch.stream_url,
            'smart': f"/api/channels/play/{ch.id}",
            'ts': f"/api/channels/play/{ch.id}",
            'hls': f"/api/channels/hls-manifest/{ch.id}/index.m3u8",
        },
        'latency': ch.latency,
        'quality': ch.quality,
        'resolution': ch.resolution,
        'audio_codec': ch.audio_codec,
        'video_codec': ch.video_codec,
        'bitrate': ch.bitrate,
        'proxy_type': ch.proxy_type,
        'error_message': ch.error_message,
        'last_checked_at': ch.last_checked_at.isoformat() if ch.last_checked_at else None,
        'is_original': ch.is_original,
        'is_passthrough': ch.is_passthrough,
        'is_public': ch.is_public,
        'public_status': ch.public_status,
        'owner_id': ch.owner_id,
        'play_count': ch.play_count,
        'total_watch_seconds': ch.total_watch_seconds,
    }


def _check_channel_access(db: Session, channel_id: int, user: User):
    """Returns (access_level, channel) or raises HTTPException."""
    channel = db.query(Channel).get(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if user.role == 'admin':
        return 'edit', channel
    if channel.owner_id == user.id:
        return 'edit', channel
    share = db.query(ChannelShare).filter_by(channel_id=channel_id, to_user_id=user.id, status='accepted').first()
    if share:
        return share.access_level, channel
    if channel.is_public:
        if user.role == 'free' and channel.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return 'read', channel
    raise HTTPException(status_code=403, detail="Access denied")


# --- CRUD ---

@router.get("")
async def list_channels(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    search: str = Query(default=None),
    group: str = Query(default=None),
    status: str = Query(default=None),
    quality: str = Query(default=None),
    sort: str = Query(default=None),
    format: str = Query(default=None),
    is_original: str = Query(default=None),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    query = db.query(Channel)

    # Permission filter
    if user.role != 'admin':
        shared_ids = db.query(ChannelShare.channel_id).filter(
            ChannelShare.to_user_id == user.id,
            ChannelShare.status == 'accepted',
        )
        if user.role == 'free':
            query = query.filter(or_(
                Channel.owner_id == user.id,
                Channel.id.in_(shared_ids),
            ))
        else: # vip
            query = query.filter(or_(
                Channel.owner_id == user.id,
                Channel.is_public == True,
                Channel.id.in_(shared_ids),
            ))

    if search:
        if search.isdigit():
            query = query.filter(or_(Channel.name.ilike(f'%{search}%'), Channel.id == int(search)))
        else:
            query = query.filter(Channel.name.ilike(f'%{search}%'))
    if group:
        query = query.filter(Channel.group_name == group)
    if status:
        query = query.filter(Channel.status == status)
    if quality:
        query = query.filter(Channel.quality == quality)
    if format:
        query = query.filter(Channel.stream_format == format)
    if is_original == '1':
        query = query.filter(Channel.is_original == True)
    elif is_original == '0':
        query = query.filter(or_(Channel.is_original == False, Channel.is_original == None))

    # Sorting
    sort_map = {
        'newest_checked': Channel.last_checked_at.desc().nullslast(),
        'oldest_checked': Channel.last_checked_at.asc().nullslast(),
        'ping_low': Channel.latency.asc().nullslast(),
        'ping_high': Channel.latency.desc().nullslast(),
        'name_asc': Channel.name.asc(),
        'name_desc': Channel.name.desc(),
    }
    query = query.order_by(sort_map.get(sort, Channel.id.desc()))

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        'channels': [_channel_to_dict(ch) for ch in items],
        'pagination': {
            'total': total,
            'page': page,
            'pages': (total + per_page - 1) // per_page,
            'has_next': page * per_page < total,
            'has_prev': page > 1,
        }
    }


@router.get("/filters")
async def channel_meta(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    """Returns distinct groups, formats, resolutions for filter dropdowns."""
    groups = sorted([g[0] for g in db.query(Channel.group_name).distinct().all() if g[0]])
    formats = sorted([f[0] for f in db.query(Channel.stream_format).distinct().all() if f[0]])
    resolutions = sorted([r[0] for r in db.query(Channel.resolution).distinct().all() if r[0]])
    return {'groups': groups, 'formats': formats, 'resolutions': resolutions}


# --- Active Sessions / Streams ---

@router.get("/sessions/active")
@router.get("/active")
async def get_active_streams(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    from app.modules.channels.services import ActiveSessionManager
    sessions = ActiveSessionManager.get_active_sessions()
    
    # Enrich with channel info
    result = []
    for s in sessions:
        ch = db.query(Channel).get(s['channel_id'])
        s_copy = s.copy()
        s_copy['channel_name'] = ch.name if ch else "Unknown Channel"
        s_copy['logo_url'] = ch.logo_url if ch else None
        
        # Calculate duration
        if 'start_time' in s:
            delta = datetime.now() - s['start_time']
            hours, remainder = divmod(int(delta.total_seconds()), 3600)
            minutes, seconds = divmod(remainder, 60)
            if hours > 0:
                s_copy['duration'] = f"{hours}h {minutes}m"
            else:
                s_copy['duration'] = f"{minutes}m {seconds}s"
        else:
            s_copy['duration'] = "0s"
            
        # Ensure strings for frontend safety
        s_copy['source'] = s.get('source') or 'Web Player'
        s_copy['user'] = s.get('user') or 'Guest'
        
        result.append(s_copy)
    return result


@router.delete("/sessions/{key:path}")
@router.delete("/{key:path}")
async def kill_session(
    key: str,
    user: User = Depends(admin_required),
):
    from app.modules.channels.services import ActiveSessionManager
    if ActiveSessionManager.remove_session(key):
        return {'status': 'ok'}
    # Also try to remove from Streams prefix if needed, but remove_session handles the key
    raise HTTPException(status_code=404, detail="Session not found")


# --- Group Management ---

@router.get("/groups/manage")
async def get_groups_manage(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    """Returns all groups with channel counts."""
    groups = db.query(Channel.group_name, func.count(Channel.id)).group_by(Channel.group_name).all()
    return [{'name': g[0] or 'Ungrouped', 'count': g[1]} for g in groups]


@router.post("/groups/rename")
async def rename_group(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    old_name = data.get('old_name')
    new_name = data.get('new_name')
    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name required")
    
    # If old_name is 'Ungrouped', it means group_name is None
    if old_name == 'Ungrouped':
        db.query(Channel).filter(Channel.group_name == None).update({Channel.group_name: new_name}, synchronize_session=False)
    else:
        db.query(Channel).filter(Channel.group_name == old_name).update({Channel.group_name: new_name}, synchronize_session=False)
    
    db.commit()
    return {'status': 'ok'}


@router.post("/groups/delete")
async def delete_group(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    name = data.get('name')
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    
    db.query(Channel).filter(Channel.group_name == name).update({Channel.group_name: None}, synchronize_session=False)
    db.commit()
    return {'status': 'ok'}


@router.post("/groups/delete-batch")
async def delete_groups_batch(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    names = data.get('names', [])
    if not names:
        raise HTTPException(status_code=400, detail="names required")
    
    db.query(Channel).filter(Channel.group_name.in_(names)).update({Channel.group_name: None}, synchronize_session=False)
    db.commit()
    return {'status': 'ok'}


@router.post("/groups/merge")
async def merge_groups(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    source_names = data.get('source_names', [])
    target_name = data.get('target_name')
    if not source_names or not target_name:
        raise HTTPException(status_code=400, detail="source_names and target_name required")
    
    db.query(Channel).filter(Channel.group_name.in_(source_names)).update({Channel.group_name: target_name}, synchronize_session=False)
    db.commit()
    return {'status': 'ok'}


@router.get("/pending-shares")
async def get_pending_shares(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    shares = db.query(ChannelShare).filter_by(to_user_id=user.id, status='pending').all()
    return [{
        'id': s.id,
        'channel_id': s.channel_id,
        'channel_name': s.channel.name if s.channel else '?',
        'from_user': s.from_user.username if s.from_user else '?',
        'access_level': s.access_level,
    } for s in shares]


@router.get("/hls-segment")
async def hls_segment(
    url: str,
    db: Session = Depends(get_db),
):
    """Proxies individual HLS segments."""
    from app.modules.channels.services import HLSEngine
    data = HLSEngine.get_segment(url)
    if data:
        return StreamingResponse(iter([data]), media_type="video/mp2t")
    raise HTTPException(status_code=502, detail="Failed to fetch segment")


@router.get("/sessions")
async def get_sessions(
    user: User = Depends(admin_required),
):
    from app.modules.channels.services import ActiveSessionManager
    sessions = ActiveSessionManager.get_active_sessions()
    stats = ActiveSessionManager.get_server_stats()
    return {'sessions': sessions, 'server_stats': stats}


@router.get("/{channel_id}")
async def get_channel(
    channel_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    access, channel = _check_channel_access(db, channel_id, user)
    result = _channel_to_dict(channel)

    # Get playlist memberships
    entries = db.query(PlaylistEntry).filter_by(channel_id=channel_id).all()
    result['playlists'] = [{
        'playlist_id': e.playlist_id,
        'group_id': e.group_id,
        'entry_id': e.id,
    } for e in entries]

    # Get all non-system playlists for assignment UI
    available_playlists = db.query(PlaylistProfile).filter_by(is_system=False).all()
    result['available_playlists'] = [{
        'id': p.id,
        'name': p.name,
        'groups': [{'id': g.id, 'name': g.name} for g in p.groups],
    } for p in available_playlists]

    result['access_level'] = access
    return result


@router.post("")
async def create_channel(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    stream_url = data.get('stream_url')
    if not stream_url:
        raise HTTPException(status_code=400, detail="stream_url is required")

    # Auto format detection
    url_lower = stream_url.lower()
    stream_format = None
    if '.m3u8' in url_lower: stream_format = 'hls'
    elif '.mp4' in url_lower: stream_format = 'mp4'
    elif '.ts' in url_lower: stream_format = 'ts'

    is_pub = bool(data.get('is_public', False))
    channel = Channel(
        name=data.get('name', 'New Channel'),
        stream_url=stream_url,
        logo_url=data.get('logo_url'),
        epg_id=data.get('epg_id'),
        group_name=data.get('group_name', 'Manual'),
        stream_format=stream_format,
        proxy_type=data.get('proxy_type', 'none'),
        is_original=data.get('is_original', False),
        is_passthrough=data.get('is_passthrough', False),
        is_public=is_pub,
        public_status='approved' if is_pub else 'none',
        owner_id=user.id,
        status='unknown',
    )
    db.add(channel)
    db.commit()
    return {'status': 'ok', 'id': channel.id}


@router.put("/{channel_id}")
async def update_channel(
    channel_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    access, channel = _check_channel_access(db, channel_id, user)
    if access != 'edit':
        raise HTTPException(status_code=403, detail="No edit access")

    for field in ['name', 'logo_url', 'group_name', 'epg_id', 'stream_url', 'proxy_type']:
        if field in data:
            setattr(channel, field, data[field])

    if 'is_original' in data:
        channel.is_original = bool(data['is_original'])
        
    if 'is_passthrough' in data:
        channel.is_passthrough = bool(data['is_passthrough'])

    if 'is_public' in data:
        channel.is_public = bool(data['is_public'])
        channel.public_status = 'approved' if channel.is_public else 'none'

    db.commit()
    return {'status': 'ok'}


@router.delete("/{channel_id}")
async def delete_channel(
    channel_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    access, channel = _check_channel_access(db, channel_id, user)
    if access != 'edit':
        raise HTTPException(status_code=403, detail="No edit access")
    # Delete all playlist entries first
    db.query(PlaylistEntry).filter_by(channel_id=channel_id).delete()
    db.delete(channel)
    db.commit()
    return {'status': 'ok'}


@router.post("/sync-playlists/{channel_id}")
async def sync_channel_playlists(
    channel_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    from app.modules.playlists.services import PlaylistService
    playlist_data = data.get('playlists', {})
    new_groups = data.get('new_groups', {})

    # Inline sync logic
    existing = db.query(PlaylistEntry).join(PlaylistProfile).filter(
        PlaylistEntry.channel_id == channel_id,
        PlaylistProfile.is_system == False,
    ).all()
    existing_map = {e.playlist_id: e for e in existing}
    targets = {int(pid): gid for pid, gid in playlist_data.items() if pid}
    new_g = {int(pid): name for pid, name in (new_groups or {}).items() if pid and name}

    for pid in existing_map:
        if pid not in targets:
            db.delete(existing_map[pid])

    for pid in targets:
        gid = targets[pid]
        final_gid = int(gid) if gid and str(gid).isdigit() else None
        name = new_g.get(pid)
        if not final_gid and name:
            g = db.query(PlaylistGroup).filter_by(playlist_id=pid, name=name).first()
            if not g:
                g = PlaylistGroup(playlist_id=pid, name=name)
                db.add(g)
                db.commit()
            final_gid = g.id

        if pid in existing_map:
            if existing_map[pid].group_id != final_gid:
                existing_map[pid].group_id = final_gid
        else:
            max_order = db.query(func.max(PlaylistEntry.order_index)).filter_by(playlist_id=pid).scalar() or 0
            db.add(PlaylistEntry(channel_id=channel_id, playlist_id=pid, group_id=final_gid, order_index=max_order + 1))

    db.commit()
    return {'status': 'ok'}


# --- Batch Operations ---

@router.post("/batch-delete")
async def batch_delete(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    ids = data.get('ids', [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    db.query(PlaylistEntry).filter(PlaylistEntry.channel_id.in_(ids)).delete(synchronize_session=False)
    count = db.query(Channel).filter(Channel.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {'status': 'ok', 'deleted': count}


@router.post("/batch-group")
async def batch_group(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    ids = data.get('ids', [])
    group_name = data.get('group_name')
    if not ids or not group_name:
        raise HTTPException(status_code=400, detail="IDs and group_name required")
    db.query(Channel).filter(Channel.id.in_(ids)).update({Channel.group_name: group_name}, synchronize_session=False)
    db.commit()
    return {'status': 'ok'}


@router.post("/batch-proxy")
async def batch_proxy(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    ids = data.get('ids', [])
    proxy_type = data.get('proxy_type', 'none')
    db.query(Channel).filter(Channel.id.in_(ids)).update({Channel.proxy_type: proxy_type}, synchronize_session=False)
    db.commit()
    return {'status': 'ok'}


# --- Sharing ---

@router.post("/share/{channel_id}")
async def share_channel(
    channel_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    to_user_id = data.get('to_user_id')
    access_level = data.get('access_level', 'read')
    if not to_user_id:
        raise HTTPException(status_code=400, detail="to_user_id required")
    existing = db.query(ChannelShare).filter_by(channel_id=channel_id, to_user_id=to_user_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Share already exists")
    share = ChannelShare(channel_id=channel_id, from_user_id=user.id, to_user_id=to_user_id, access_level=access_level)
    db.add(share)
    db.commit()
    return {'status': 'ok', 'id': share.id}


@router.post("/share/{share_id}/accept")
async def accept_share(
    share_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    share = db.query(ChannelShare).get(share_id)
    if not share or share.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    share.status = 'accepted'
    db.commit()
    return {'status': 'ok'}



# --- Proxy / Streaming ---

@router.get("/track/{channel_id}")
async def track_redirect(
    channel_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Tracking redirect — increments play_count, then redirects to stream URL."""
    channel = db.query(Channel).get(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    channel.play_count = (channel.play_count or 0) + 1
    db.commit()

    from app.modules.channels.services import ActiveSessionManager
    ActiveSessionManager.update_session(
        channel_id, 'External', request.client.host,
        'M3U Player', user_agent=request.headers.get('user-agent'),
    )

    return RedirectResponse(url=channel.stream_url, status_code=302)


@router.get("/play/{channel_id}")
async def play_channel(
    channel_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """TS Proxy — Proxies the stream through the server."""
    channel = db.query(Channel).get(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    from app.modules.settings.services import SettingService
    if not SettingService.get(db, 'ENABLE_TS_PROXY', True):
        return RedirectResponse(url=channel.stream_url, status_code=302)

    channel.play_count = (channel.play_count or 0) + 1
    db.commit()

    from app.modules.channels.services import StreamManager, ActiveSessionManager

    url = channel.stream_url
    headers = {'User-Agent': request.headers.get('user-agent', 'IPTV-Manager/2.0')}
    q, sid = StreamManager.get_source_stream(url, headers)

    ActiveSessionManager.update_session(
        channel_id, 'Proxy', request.client.host,
        'TS Proxy', user_agent=request.headers.get('user-agent'),
    )

    def generate():
        try:
            while True:
                try:
                    chunk = q.get(timeout=30)
                    yield chunk
                except queue.Empty:
                    break
        finally:
            StreamManager.remove_client(sid, q)

    is_flv = '.flv' in url.lower().split('?')[0]
    mimetype = 'video/x-flv' if is_flv else 'video/mp2t'
    return StreamingResponse(generate(), media_type=mimetype)


@router.get("/hls-manifest/{channel_id}/index.m3u8")
async def play_hls(
    channel_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """HLS Proxy — Rewrites M3U8 manifests to proxy segment URLs."""
    import requests as http_requests
    import re

    channel = db.query(Channel).get(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    from app.modules.settings.services import SettingService
    if not SettingService.get(db, 'ENABLE_HLS_PROXY', True):
        return RedirectResponse(url=channel.stream_url, status_code=302)

    ua = SettingService.get(db, 'CUSTOM_USER_AGENT', 'Mozilla/5.0')
    headers = {'User-Agent': ua, 'Referer': channel.stream_url}

    try:
        resp = http_requests.get(channel.stream_url, headers=headers, timeout=12)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Source returned {resp.status_code}")
        content = resp.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    base_url = str(request.base_url).rstrip('/')
    source_base = channel.stream_url.rsplit('/', 1)[0]

    def rewrite_line(line):
        line = line.strip()
        if not line or line.startswith('#'):
            return line
        # Absolute URL segments
        if line.startswith('http'):
            seg_url = line
        else:
            seg_url = f"{source_base}/{line}"
        # Encode segment URL for proxying
        from urllib.parse import quote
        return f"{base_url}/api/channels/hls-segment?url={quote(seg_url, safe='')}"

    rewritten = '\n'.join(rewrite_line(l) for l in content.split('\n'))
    return StreamingResponse(iter([rewritten.encode()]), media_type="application/vnd.apple.mpegurl")



# --- Active Sessions ---


@router.post("/sessions/kick")
async def kick_session(
    data: dict = Body(...),
    user: User = Depends(admin_required),
):
    from app.modules.channels.services import ActiveSessionManager
    key = data.get('key')
    if ActiveSessionManager.remove_session(key):
        return {'status': 'ok'}
    raise HTTPException(status_code=404, detail="Session not found")


# --- Player Ping ---

@router.post("/player_ping")
async def player_ping(
    data: dict = Body(default={}),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cid = data.get('channel_id')
    sec = data.get('seconds', 30)
    ch = db.query(Channel).get(cid)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    ch.total_watch_seconds = (ch.total_watch_seconds or 0) + sec
    ch.total_bandwidth_mb = (ch.total_bandwidth_mb or 0) + (8.0 * sec) / 8
    db.commit()

    return {'status': 'ok'}


# --- Scan Web / Bulk Scan ---

@router.post("/scan-web")
async def scan_web(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    if user.role not in ['admin', 'vip']:
        raise HTTPException(status_code=403, detail="Premium feature")

    url = data.get('url')
    deep = data.get('deep', False)
    if not url:
        raise HTTPException(status_code=400, detail="URL required")

    from app.modules.channels.services import ExtractorService
    from app.core.task_dispatcher import TaskDispatcher
    result = TaskDispatcher.dispatch(ExtractorService.extract_direct_url, url, deep_scan=deep)
    return {'task_id': result.id}


@router.post("/bulk-scan")
async def bulk_scan(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    if user.role not in ['admin', 'vip']:
        raise HTTPException(status_code=403, detail="Premium feature")

    url = data.get('url')
    deep = data.get('deep', False)
    if not url:
        raise HTTPException(status_code=400, detail="URL required")

    from app.modules.channels.services import ExtractorService
    from app.core.task_dispatcher import TaskDispatcher
    result = TaskDispatcher.dispatch(ExtractorService.extract_direct_url, url, deep_scan=deep)
    return {'task_id': result.id}


@router.get("/bulk-scan/status/{task_id}")
async def bulk_scan_status(
    task_id: str,
    user: User = Depends(login_required),
):
    from app.core.task_dispatcher import TaskDispatcher
    task = TaskDispatcher.get_task_result(task_id)
    if not task:
        return {'state': 'UNKNOWN', 'status': 'Task not found'}

    return {
        'state': task.state,
        'current': task.info.get('current', 0) if isinstance(task.info, dict) else 0,
        'total': task.info.get('total', 0) if isinstance(task.info, dict) else 0,
        'status': task.info.get('status', '') if isinstance(task.info, dict) else '',
        'result': task.result if task.state == 'SUCCESS' else None,
    }


@router.post("/{channel_id}/touch")
async def touch_channel(
    channel_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    """Updates play_count and last_seen when player starts."""
    channel = db.query(Channel).get(channel_id)
    if channel:
        channel.play_count = (channel.play_count or 0) + 1
        channel.status = 'live'
        channel.last_checked_at = datetime.utcnow()
        db.commit()
        
        # Trigger background health check (passive)
        from app.modules.health.services import HealthCheckService
        HealthCheckService.trigger_passive_check(db, channel_id)
        
        return {'status': 'ok', 'new_status': 'live'}
    raise HTTPException(status_code=404, detail="Channel not found")


@router.post("/{channel_id}/check")
async def check_channel_now(
    channel_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    """Triggers an immediate health check for a single channel."""
    from app.modules.health.services import HealthCheckService
    result = HealthCheckService.check_stream(db, channel_id, force=True)
    return {'status': 'ok', 'result': result}




# --- Open VLC ---

@router.post("/open-vlc")
async def open_vlc(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    channel_id = data.get('channel_id')
    if not channel_id:
        raise HTTPException(status_code=400, detail="channel_id required")
    channel = db.query(Channel).get(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    from app.modules.channels.services import ChannelService
    success = ChannelService.play_with_vlc(channel.stream_url)
    if success:
        return {'status': 'ok'}
    return {'status': 'error', 'message': 'VLC not found'}

