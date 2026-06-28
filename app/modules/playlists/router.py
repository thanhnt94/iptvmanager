"""
Playlists Router () — FastAPI, no Flask dependency.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import login_required, admin_required, get_current_user
from app.modules.auth.models import User, UserPlaylist
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
from app.modules.playlists.services import PlaylistService

logger = logging.getLogger('iptv')

router = APIRouter()
legacy_router = APIRouter()


# --- Playlist CRUD ---

@router.get("")
async def list_playlists(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    """Get all accessible playlists for current user."""
    if user.role == 'admin':
        playlists = db.query(PlaylistProfile).filter(
            PlaylistProfile.is_system == False,
            PlaylistProfile.is_dynamic == False
        ).all()
    else:
        accessible_ids = [up.playlist_id for up in db.query(UserPlaylist).filter_by(user_id=user.id).all()]
        playlists = db.query(PlaylistProfile).filter(
            PlaylistProfile.is_system == False,
            PlaylistProfile.is_dynamic == False,
            or_(
                PlaylistProfile.id.in_(accessible_ids),
                PlaylistProfile.owner_id == user.id
            )
        ).all()

    result = []
    from app.modules.playlists.models import DiscoveryChannel
    from app.modules.channels.models import Channel

    for p in playlists:
        if p.is_dynamic:
            channel_count = db.query(DiscoveryChannel).filter_by(playlist_id=p.id).count()
            live_count = db.query(DiscoveryChannel).filter_by(playlist_id=p.id, status='live').count()
            die_count = db.query(DiscoveryChannel).filter_by(playlist_id=p.id, status='die').count()
        else:
            channel_count = db.query(PlaylistEntry).filter_by(playlist_id=p.id).count()
            live_count = db.query(PlaylistEntry).join(Channel).filter(PlaylistEntry.playlist_id == p.id, Channel.status == 'live').count()
            die_count = db.query(PlaylistEntry).join(Channel).filter(PlaylistEntry.playlist_id == p.id, Channel.status == 'die').count()

        result.append({
            'id': p.id,
            'name': p.name,
            'slug': p.slug,
            'is_system': p.is_system,
            'is_active': p.is_active,
            'is_dynamic': p.is_dynamic,
            'owner_id': p.owner_id,
            'security_token': p.security_token,
            'channel_count': channel_count,
            'live_count': live_count,
            'die_count': die_count,
            'auto_scan_enabled': p.auto_scan_enabled,
            'auto_scan_time': p.auto_scan_time,
            'is_scanning': p.is_scanning,
            'owner_username': user.username, # Add this for tab filtering in frontend
        })
    return result


@router.get("/dynamic/types")
async def get_dynamic_types(
    user: User = Depends(login_required),
):
    """Returns supported dynamic scanner engines."""
    # This should ideally come from a plugin system, but we'll hardcode for now
    return {
        'status': 'success',
        'types': [
            {'id': 'colatv', 'name': 'ColaTV Discovery'},
            {'id': '90phut', 'name': '90Phut Sports'},
            {'id': 'vebo', 'name': 'Vebo Live'},
            {'id': 'xoilac', 'name': 'XoiLac TV'},
        ]
    }


@router.post("/dynamic")
async def create_dynamic_playlist(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    name = data.get('name')
    url = data.get('website_url')
    scanner = data.get('scanner_type')
    if not all([name, url, scanner]):
        raise HTTPException(status_code=400, detail="Name, URL and Scanner Type required")

    profile = PlaylistService.create_profile(db, name, name.lower().replace(' ', '-'))
    profile.owner_id = user.id
    profile.is_dynamic = True
    profile.website_url = url
    profile.scanner_type = scanner
    db.commit()
    return {'status': 'success', 'id': profile.id}


@router.post("/{playlist_id}/sync")
async def sync_playlist(
    playlist_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    """Triggers a background sync/scan for a dynamic playlist."""
    profile = db.query(PlaylistProfile).get(playlist_id)
    if not profile or not profile.is_dynamic:
        raise HTTPException(status_code=404, detail="Dynamic playlist not found")

    from app.modules.health.services import HealthCheckService
    HealthCheckService.start_background_scan(db, mode='playlist', playlist_id=playlist_id)
    return {'status': 'success', 'message': 'Sync started'}


@router.post("")
async def create_playlist(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    name = data.get('name')
    slug = data.get('slug')
    if not name or not slug:
        raise HTTPException(status_code=400, detail="Name and slug required")

    profile = PlaylistService.create_profile(db, name, slug)
    profile.owner_id = user.id
    db.commit()
    return {'status': 'ok', 'id': profile.id, 'token': profile.security_token}


@router.put("/{playlist_id}")
async def update_playlist(
    playlist_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    success, result = PlaylistService.update_profile(
        db, playlist_id,
        name=data.get('name'),
        slug=data.get('slug'),
        auto_scan_enabled=data.get('auto_scan_enabled'),
        auto_scan_time=data.get('auto_scan_time'),
    )
    if success:
        return {'status': 'ok'}
    raise HTTPException(status_code=400, detail=str(result))


@router.delete("/{playlist_id}")
async def delete_playlist(
    playlist_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    success, msg = PlaylistService.delete_profile(db, playlist_id)
    if success:
        return {'status': 'ok'}
    raise HTTPException(status_code=400, detail=msg)


# --- Playlist Entries ---

@router.get("/entries/{playlist_id}")
async def get_entries(
    playlist_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1),
    q: str = Query(default=None),
    group: str = Query(default=None),
    hide_die: str = Query(default='false'),
    sort: str = Query(default='alphabetical'),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    profile = db.query(PlaylistProfile).get(playlist_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Playlist not found")

    from app.modules.playlists.models import DiscoveryChannel, PlaylistEntry
    from app.modules.channels.models import Channel
    from sqlalchemy import or_

    channels_data = []
    has_more = False

    if profile.is_dynamic:
        # Fetch from DiscoveryChannel
        query = db.query(DiscoveryChannel).filter_by(playlist_id=playlist_id)
        if q:
            query = query.filter(DiscoveryChannel.name.ilike(f"%{q}%"))
        if hide_die == 'true':
            query = query.filter(DiscoveryChannel.status == 'live')
        
        # Sort
        if sort == 'alphabetical':
            query = query.order_by(DiscoveryChannel.name.asc())
        else:
            query = query.order_by(DiscoveryChannel.id.desc())

        total = query.count()
        items = query.offset((page - 1) * limit).limit(limit + 1).all()
        
        if len(items) > limit:
            has_more = True
            items = items[:limit]

        for item in items:
            channels_data.append({
                'id': item.id,
                'name': item.name,
                'logo_url': None,
                'status': item.status,
                'play_url': item.stream_url,
                'stream_format': 'hls' if '.m3u8' in item.stream_url.lower() else 'ts',
                'quality': 'HD',
                'resolution': '1080p',
                'group': 'Discovery'
            })
    elif profile.is_system:
        # Fetch from Channel directly (Virtual System Playlist)
        query = db.query(Channel)
        if profile.owner_id:
            oid = int(profile.owner_id)
            if "protected" in (profile.slug or ""):
                query = query.filter(Channel.owner_id == oid, Channel.is_original == True)
            else:
                query = query.filter(or_(Channel.owner_id == oid, Channel.is_public == True))
        else:
            query = query.filter_by(is_public=True)

        if q:
            query = query.filter(Channel.name.ilike(f"%{q}%"))
        if hide_die == 'true':
            query = query.filter(Channel.status == 'live')
        if group:
            query = query.filter(Channel.group_name == group)

        # Sorting
        if sort == 'alphabetical':
            query = query.order_by(Channel.name.asc())
        elif sort == 'status':
            query = query.order_by(Channel.status.desc(), Channel.name.asc())
        else:
            query = query.order_by(Channel.id.desc())

        items = query.offset((page - 1) * limit).limit(limit + 1).all()
        if len(items) > limit:
            has_more = True
            items = items[:limit]

        for ch in items:
            channels_data.append({
                'id': ch.id,
                'name': ch.name,
                'logo_url': ch.logo_url,
                'status': ch.status,
                'play_url': f"/api/channels/play/{ch.id}",
                'play_links': {
                    'original': ch.stream_url,
                    'smart': f"/api/channels/play/{ch.id}",
                    'ts': f"/api/channels/play/{ch.id}",
                    'hls': f"/api/channels/hls-manifest/{ch.id}/index.m3u8",
                },
                'stream_format': ch.stream_format or 'ts',
                'quality': ch.quality or 'HD',
                'resolution': ch.resolution or '1080p',
                'group': ch.group_name or 'General',
                'epg_id': ch.epg_id,
            })
    else:
        # Fetch from PlaylistEntry -> Channel
        query = db.query(PlaylistEntry).filter_by(playlist_id=playlist_id)
        
        # Filtering via joined Channel
        if q or hide_die == 'true' or group:
            query = query.join(Channel)
            if q:
                query = query.filter(Channel.name.ilike(f"%{q}%"))
            if hide_die == 'true':
                query = query.filter(Channel.status == 'live')
            if group:
                query = query.filter(or_(
                    PlaylistEntry.custom_group == group,
                    Channel.group_name == group
                ))

        # Sorting
        if sort == 'alphabetical':
            query = query.join(Channel).order_by(Channel.name.asc())
        elif sort == 'status':
            query = query.join(Channel).order_by(Channel.status.desc(), Channel.name.asc())
        else:
            query = query.order_by(PlaylistEntry.order_index.asc())

        items = query.offset((page - 1) * limit).limit(limit + 1).all()
        if len(items) > limit:
            has_more = True
            items = items[:limit]

        for e in items:
            if not e.channel: continue
            channels_data.append({
                'id': e.id,
                'channel_id': e.channel.id,
                'name': e.custom_name or e.channel.name,
                'custom_name': e.custom_name,
                'custom_group': e.custom_group,
                'logo_url': e.channel.logo_url,
                'status': e.channel.status,
                'play_url': f"/api/channels/play/{e.channel.id}",
                'play_links': {
                    'original': e.channel.stream_url,
                    'smart': f"/api/channels/play/{e.channel.id}",
                    'ts': f"/api/channels/play/{e.channel.id}",
                    'hls': f"/api/channels/hls-manifest/{e.channel.id}/index.m3u8",
                },
                'stream_format': e.channel.stream_format or 'ts',
                'quality': e.channel.quality or 'HD',
                'resolution': e.channel.resolution or '1080p',
                'group': e.custom_group or (e.group.name if e.group else e.channel.group_name or 'General'),
                'epg_id': e.channel.epg_id,
            })

    return {
        'channels': channels_data,
        'has_more': has_more,
        'page': page
    }


@router.post("/{playlist_id}/entries")
async def add_entry(
    playlist_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    channel_id = data.get('channel_id')
    group_id = data.get('group_id')
    new_group_name = data.get('new_group_name')
    entry = PlaylistService.add_channel_to_playlist(db, playlist_id, channel_id, group_id, new_group_name)
    return {'status': 'ok', 'id': entry.id if entry else None}


@router.post("/{playlist_id}/batch-add")
async def batch_add_entries(
    playlist_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    channel_ids = data.get('channel_ids', [])
    group_id = data.get('group_id')
    count = PlaylistService.batch_add_channels_to_playlist(db, playlist_id, channel_ids, group_id)
    return {'status': 'ok', 'added': count}


@router.delete("/{playlist_id}/entries/{entry_id}")
async def remove_entry(
    playlist_id: int,
    entry_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    entry = db.query(PlaylistEntry).get(entry_id)
    if entry and entry.playlist_id == playlist_id:
        db.delete(entry)
        db.commit()
        return {'status': 'ok'}
    raise HTTPException(status_code=404, detail="Entry not found")


@router.post("/{playlist_id}/reorder")
async def reorder_entries(
    playlist_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    entry_ids = data.get('entry_ids', [])
    PlaylistService.reorder_entries(db, playlist_id, entry_ids)
    return {'status': 'ok'}


# --- Groups ---

@router.get("/groups/{playlist_id}")
async def get_groups(
    playlist_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    profile = db.query(PlaylistProfile).get(playlist_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if profile.is_system:
        # For system playlists, get distinct group names from Channel table
        from app.modules.channels.models import Channel
        from sqlalchemy import func, or_
        
        query = db.query(Channel.group_name)
        if profile.owner_id:
            oid = int(profile.owner_id)
            from app.modules.auth.models import User
            owner_user = db.query(User).get(oid)
            owner_role = owner_user.role if owner_user else 'free'
            
            if "protected" in (profile.slug or ""):
                query = query.filter(Channel.owner_id == oid, Channel.is_original == True)
            else:
                if owner_role == 'free':
                    query = query.filter(Channel.owner_id == oid)
                else:
                    query = query.filter(or_(Channel.owner_id == oid, Channel.is_public == True))
        else:
            query = query.filter_by(is_public=True)
            
        groups = query.filter(Channel.group_name != None).distinct().all()
        return [{'id': g[0], 'name': g[0], 'order_index': 0} for g in groups if g[0]]
    
    # Regular playlists use the PlaylistGroup table
    groups = db.query(PlaylistGroup).filter_by(playlist_id=playlist_id).order_by(PlaylistGroup.order_index).all()
    return [{'id': g.id, 'name': g.name, 'order_index': g.order_index} for g in groups]


@router.post("/{playlist_id}/groups")
async def create_group(
    playlist_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    name = data.get('name')
    if not name:
        raise HTTPException(status_code=400, detail="Group name required")
    group = PlaylistService.create_group(db, playlist_id, name)
    return {'status': 'ok', 'id': group.id}


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    group = db.query(PlaylistGroup).get(group_id)
    if group:
        db.delete(group)
        db.commit()
        return {'status': 'ok'}
    raise HTTPException(status_code=404, detail="Group not found")


@router.post("/update-entry-group/{entry_id}")
async def update_entry_group(
    entry_id: int,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    entry = db.query(PlaylistEntry).get(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.playlist.owner_id != user.id and user.role != 'admin':
        raise HTTPException(status_code=403, detail="Access denied")

    group_id = data.get('group_id')
    if group_id == "" or group_id == 0 or group_id == '0':
        group_id = None
        
    entry.group_id = group_id
    
    if 'custom_name' in data:
        entry.custom_name = data.get('custom_name')
        
    if 'custom_group' in data:
        entry.custom_group = data.get('custom_group')
        
    db.commit()
    return {'status': 'ok'}


# --- M3U / XMLTV Publishing ---

@router.get("/publish/{slug}/playlist.m3u8")
async def publish_m3u(
    slug: str,
    request: Request,
    token: str = Query(default=None),
    hide_die: bool = Query(default=False),
    mode: str = Query(default=None),
    db: Session = Depends(get_db),
):
    profile = db.query(PlaylistProfile).filter_by(slug=slug).first()
    if not profile or not profile.is_active:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Token validation
    if profile.security_token and token != profile.security_token:
        raise HTTPException(status_code=403, detail="Invalid or missing token")

    base_url = str(request.base_url).rstrip('/')
    epg_url_base = f"{base_url}/api/playlists/publish/{slug}/epg.xml"
    if token:
        epg_url_base += f"?token={token}"

    content = PlaylistService.generate_m3u(db, profile.id, base_url=base_url, epg_url=epg_url_base, hide_die=hide_die, mode=mode)
    if not content:
        raise HTTPException(status_code=404, detail="Empty playlist")
    return PlainTextResponse(content, media_type="audio/mpegurl")


@router.get("/publish/{slug}/epg.xml")
async def publish_epg(
    slug: str,
    token: str = Query(default=None),
    db: Session = Depends(get_db),
):
    profile = db.query(PlaylistProfile).filter_by(slug=slug).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if profile.security_token and token != profile.security_token:
        raise HTTPException(status_code=403, detail="Invalid token")
    content = PlaylistService.generate_xmltv(db, profile.id)
    return PlainTextResponse(content, media_type="application/xml")


# --- Friendly URL Support ---

@router.get("/m3u/{slug}")
@router.get("/m3u/{slug}/{filename}")
async def friendly_m3u(
    slug: str,
    request: Request,
    filename: str = None,
    token: str = Query(default=None),
    hide_die: bool = Query(default=False),
    mode: str = Query(default=None),
    status: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """Friendly M3U URLs: /m3u/my-playlist or /m3u/my-playlist/custom.m3u8"""
    profile = db.query(PlaylistProfile).filter_by(slug=slug).first()
    if not profile or not profile.is_active:
        raise HTTPException(status_code=404, detail="Playlist not found or inactive")

    if profile.security_token and token != profile.security_token:
        raise HTTPException(status_code=403, detail="Invalid or missing token")

    effective_hide_die = hide_die
    if status == 'live':
        effective_hide_die = True

    base_url = str(request.base_url).rstrip('/')
    content = PlaylistService.generate_m3u(db, profile.id, base_url=base_url, hide_die=effective_hide_die, mode=mode)
    if not content:
        raise HTTPException(status_code=404, detail="Empty playlist")
    return PlainTextResponse(content, media_type="audio/mpegurl")

@legacy_router.get("/p/{path:path}", tags=["Legacy"])
async def legacy_m3u(
    path: str,
    request: Request,
    token: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Catch-all Legacy URL support: /p/admin/tv/track/live
    Parses path segments manually.
    """
    parts = path.split('/')
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid playlist URL format")
    
    username = parts[0]
    slug = parts[1]
    mode = parts[2] if len(parts) > 2 else 'smart'
    status = parts[3] if len(parts) > 3 else None

    from app.modules.auth.models import User
    user = db.query(User).filter_by(username=username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    profile = db.query(PlaylistProfile).filter_by(slug=slug, owner_id=user.id).first()
    if not profile:
        profile = db.query(PlaylistProfile).filter_by(slug=slug, is_system=True).first()
        
    if not profile or not profile.is_active:
        raise HTTPException(status_code=404, detail="Playlist not found")

    base_url = str(request.base_url).rstrip('/')
    hide_die = (status == 'live')
    content = PlaylistService.generate_m3u(db, profile.id, base_url=base_url, mode=mode, hide_die=hide_die)
    if not content:
        raise HTTPException(status_code=404, detail="Empty playlist")
    return PlainTextResponse(content, media_type="text/plain")
