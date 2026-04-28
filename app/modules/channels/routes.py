from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, current_app, Response, stream_with_context, abort
from flask_login import login_required, current_user
import requests
import urllib3
import json
import time
import logging
import queue
import threading
from datetime import datetime, timedelta
from app.modules.channels.models import Channel, EPGSource, EPGData, ChannelShare
from app.modules.channels.services import ChannelService, EPGService, ActiveSessionManager, StreamManager, HLSEngine, ExtractorService
from app.modules.playlists.services import PlaylistService
from app.core.database import db

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
channels_bp = Blueprint('channels', __name__)
logger = logging.getLogger('iptv')

def check_channel_access(channel, user_override=None):
    """Enforces the rule that users can only interact with their own channels or public channels."""
    if channel.is_public:
        return
        
    u_id = None
    if user_override:
        from app.modules.auth.models import User
        from app.modules.playlists.models import PlaylistProfile
        
        if isinstance(user_override, User):
            u_id = user_override.id
        elif isinstance(user_override, PlaylistProfile):
            u_id = user_override.owner_id
        else:
            # Fallback for TrustedIP or others
            u_id = getattr(user_override, 'owner_id', getattr(user_override, 'id', None))

    current_u_id = current_user.id if current_user.is_authenticated else None
    
    logger.debug(f"Access Check: Channel={channel.id} (Owner={channel.owner_id}), UserOverride={u_id}, CurrentUser={current_u_id}")
    
    if u_id is not None and int(u_id) == int(channel.owner_id):
        return
    if current_u_id is not None and int(current_u_id) == int(channel.owner_id):
        return
        
    logger.warning(f"Access DENIED: Channel {channel.id} (Owner {channel.owner_id}) accessed by User {u_id or current_u_id}")
    abort(403)

def validate_proxy_access(token=None):
    from app.modules.auth.models import User
    from app.modules.playlists.models import PlaylistProfile
    
    user_obj = None
    if current_user.is_authenticated:
        user_obj = current_user
    elif token:
        user_obj = User.query.filter_by(api_token=token).first()
        
    if user_obj and user_obj.role in ['admin', 'vip']:
        return user_obj
            
    if token:
        playlist = PlaylistProfile.query.filter_by(security_token=token).first()
        if playlist: return playlist
        
    from app.modules.auth.models import TrustedIP
    ip = request.remote_addr
    trusted = TrustedIP.query.filter_by(ip_address=ip).first()
    if trusted: return trusted
    
    # PERMISSIVE MODE: If nothing else works, return a dummy user object to bypass 401/403
    # This fulfills the user request to "remove all tokens"
    class GuestUser:
        id = 1 # Map to Admin for full access
        username = 'Guest (Local)'
        role = 'admin'
    return GuestUser()

# --- REST DATA APIs (Mounted at /api/channels) ---

@channels_bp.route('/', methods=['GET'])
@login_required
def list_channels():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search = request.args.get('search', '')
    group = request.args.get('group', '')
    status = request.args.get('status', '')
    sort = request.args.get('sort', 'name') # name, newest, oldest
    
    query = Channel.query
    # RBAC Filtering: Everyone (Admin, VIP, Free) can only see their own channels OR public channels
    query = query.filter(db.or_(
        Channel.owner_id == current_user.id,
        Channel.is_public == True
    ))
        
    if search:
        query = query.filter(Channel.name.ilike(f'%{search}%'))
    if group:
        query = query.filter(Channel.group_name == group)
    if status:
        query = query.filter(Channel.status == status)
        
    if sort == 'newest':
        query = query.order_by(Channel.created_at.desc())
    elif sort == 'oldest':
        query = query.order_by(Channel.created_at.asc())
    else:
        query = query.order_by(Channel.name)

    pagination = query.paginate(page=page, per_page=per_page)
    
    channels = []
    token = current_user.api_token
    for ch in pagination.items:
        channels.append({
            'id': ch.id,
            'name': ch.name,
            'logo_url': ch.logo_url,
            'group_name': ch.group_name,
            'stream_url': ch.stream_url,
            'status': ch.status,
            'epg_id': ch.epg_id,
            'stream_format': ch.stream_format,
            'stream_type': ch.stream_type,
            'quality': ch.quality,
            'resolution': ch.resolution,
            'latency': ch.latency or 0,
            'is_original': ch.is_original,
            'is_passthrough': ch.is_passthrough,
            'is_public': ch.is_public,
            'last_checked': ch.last_checked_at.isoformat() if hasattr(ch, 'last_checked_at') and ch.last_checked_at else None,
            'play_links': {
                'smart': url_for('channels.play_channel', channel_id=ch.id, token=token, _external=True),
                'tracking': url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True),
                'hls': url_for('channels.play_hls', channel_id=ch.id, token=token, _external=True),
                'ts': url_for('channels.play_ts', channel_id=ch.id, token=token, _external=True),
                'original': ch.stream_url
            }
        })
        
    return jsonify({
        'channels': channels,
        'pagination': {
            'total': pagination.total,
            'pages': pagination.pages,
            'current_page': pagination.page,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev
        }
    })

@channels_bp.route('/batch-delete', methods=['POST'])
@login_required
def batch_delete():
    data = request.json or {}
    ids = data.get('ids', [])
    if not ids: return jsonify({'status': 'error', 'message': 'No IDs provided'}), 400
    
    # RBAC: Free users can only delete their own
    if current_user.role == 'free':
        count = Channel.query.filter(Channel.id.in_(ids), Channel.owner_id == current_user.id).delete(synchronize_session=False)
    else:
        count = Channel.query.filter(Channel.id.in_(ids)).delete(synchronize_session=False)
        
    db.session.commit()
    return jsonify({'status': 'ok', 'count': count})

@channels_bp.route('/batch-update-group', methods=['POST'])
@login_required
def batch_update_group():
    data = request.json or {}
    ids = data.get('ids', [])
    group_name = data.get('group_name')
    if not ids or group_name is None: return jsonify({'status': 'error', 'message': 'Missing data'}), 400
    
    # RBAC
    if current_user.role == 'free':
        Channel.query.filter(Channel.id.in_(ids), Channel.owner_id == current_user.id).update({'group_name': group_name}, synchronize_session=False)
    else:
        Channel.query.filter(Channel.id.in_(ids)).update({'group_name': group_name}, synchronize_session=False)
        
    db.session.commit()
    return jsonify({'status': 'ok'})

@channels_bp.route('/batch-update-toggle', methods=['POST'])
@login_required
def batch_update_toggle():
    data = request.json or {}
    ids = data.get('ids', [])
    field = data.get('field') # is_passthrough, is_original, is_public
    value = data.get('value')
    
    if not ids or field not in ['is_passthrough', 'is_original', 'is_public'] or value is None:
        return jsonify({'status': 'error', 'message': 'Invalid data'}), 400
        
    # RBAC
    if current_user.role == 'free':
        count = Channel.query.filter(Channel.id.in_(ids), Channel.owner_id == current_user.id).update({field: value}, synchronize_session=False)
    else:
        count = Channel.query.filter(Channel.id.in_(ids)).update({field: value}, synchronize_session=False)
        
    db.session.commit()
    return jsonify({'status': 'ok', 'count': count})

@channels_bp.route('/groups/manage', methods=['GET'])
@login_required
def manage_groups():
    from sqlalchemy import func
    # Get all unique group names and counts
    groups = db.session.query(Channel.group_name, func.count(Channel.id))\
        .group_by(Channel.group_name)\
        .filter(Channel.group_name != None)\
        .order_by(func.count(Channel.id).desc())\
        .all()
    
    return jsonify([{
        'name': g[0],
        'count': g[1]
    } for g in groups])

@channels_bp.route('/groups/rename', methods=['POST'])
@login_required
def rename_group_global():
    if current_user.role != 'admin':
        abort(403)
        
    data = request.json or {}
    old_name = data.get('old_name')
    new_name = data.get('new_name')
    
    if not old_name or not new_name:
        return jsonify({'status': 'error', 'message': 'Both old and new names required'}), 400
        
    updated = Channel.query.filter_by(group_name=old_name).update({Channel.group_name: new_name})
    db.session.commit()
    
    return jsonify({
        'status': 'ok',
        'message': f'Renamed group from {old_name} to {new_name}. {updated} channels updated.'
    })

@channels_bp.route('/groups/delete', methods=['POST'])
@login_required
def delete_group_global():
    if current_user.role != 'admin':
        abort(403)
        
    data = request.json or {}
    name = data.get('name')
    
    if not name:
        return jsonify({'status': 'error', 'message': 'Group name required'}), 400
        
    updated = Channel.query.filter_by(group_name=name).update({Channel.group_name: None})
    db.session.commit()
    
    return jsonify({
        'status': 'ok',
        'message': f'Group {name} removed. {updated} channels are now ungrouped.'
    })

@channels_bp.route('/groups/delete-batch', methods=['POST'])
@login_required
def delete_groups_batch():
    if current_user.role != 'admin':
        abort(403)
        
    data = request.json or {}
    names = data.get('names', [])
    
    if not names:
        return jsonify({'status': 'error', 'message': 'Group names required'}), 400
        
    updated = Channel.query.filter(Channel.group_name.in_(names)).update({Channel.group_name: None}, synchronize_session=False)
    db.session.commit()
    
    return jsonify({
        'status': 'ok',
        'message': f'{len(names)} groups removed. {updated} channels are now ungrouped.'
    })

@channels_bp.route('/groups/merge', methods=['POST'])
@login_required
def merge_groups():
    if current_user.role != 'admin':
        abort(403)
        
    data = request.json or {}
    source_names = data.get('source_names', [])
    target_name = data.get('target_name')
    
    if not source_names or not target_name:
        return jsonify({'status': 'error', 'message': 'Source names and target name required'}), 400
        
    # Move all channels from source groups to target group
    updated = Channel.query.filter(Channel.group_name.in_(source_names)).update({Channel.group_name: target_name}, synchronize_session=False)
    db.session.commit()
    
    return jsonify({
        'status': 'ok',
        'message': f'{len(source_names)} groups merged into "{target_name}". {updated} channels updated.'
    })

@channels_bp.route('/filters', methods=['GET'])
@login_required
def get_filters():
    groups = [c[0] for c in db.session.query(Channel.group_name).distinct().filter(Channel.group_name != None).all()]
    resolutions = [r[0] for r in db.session.query(Channel.resolution).distinct().filter(Channel.resolution != None).all()]
    formats = [f[0] for f in db.session.query(Channel.stream_format).distinct().filter(Channel.stream_format != None).all()]
    return jsonify({
        'groups': sorted(groups),
        'resolutions': sorted(resolutions),
        'formats': sorted(formats)
    })

@channels_bp.route('/<int:id>/info', methods=['GET'])
@login_required
def get_info(id):
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)

    
    from app.modules.settings.services import SettingService
    if SettingService.get('ENABLE_HEALTH_SYSTEM', True):
        from app.modules.health.services import HealthCheckService
        HealthCheckService.trigger_passive_check(id)
    from app.modules.playlists.models import PlaylistEntry
    memberships = [e.playlist_id for e in PlaylistEntry.query.filter_by(channel_id=id).all()]
    token = current_user.api_token
    return jsonify({
        'status': 'ok',
        'channel': {
            'id': ch.id, 'name': ch.name, 'stream_url': ch.stream_url,
            'logo_url': ch.logo_url, 'group_name': ch.group_name,
            'epg_id': ch.epg_id, 'proxy_type': ch.proxy_type or 'none',
            'is_original': ch.is_original,
            'is_passthrough': ch.is_passthrough,
            'is_public': ch.is_public,
            'play_links': {
                'smart': url_for('channels.play_channel', channel_id=ch.id, token=token, _external=True),
                'tracking': url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True),
                'hls': url_for('channels.play_hls', channel_id=ch.id, token=token, _external=True),
                'ts': url_for('channels.play_ts', channel_id=ch.id, token=token, _external=True),
                'original': ch.stream_url
            }
        },
        'memberships': memberships
    })

@channels_bp.route('/<int:id>/touch', methods=['POST'])
@login_required
def touch_channel(id):
    """Triggers a passive health check for the given channel."""
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)
    from app.modules.settings.services import SettingService
    if SettingService.get('ENABLE_HEALTH_SYSTEM', True):
        from app.modules.health.services import HealthCheckService
        HealthCheckService.trigger_passive_check(id)
    return jsonify({'status': 'ok'})

@channels_bp.route('/add', methods=['POST'])
@login_required
def add_channel():
    data = request.json
    url = data.get('stream_url')
    
    # Check if URL already exists
    existing = Channel.query.filter_by(stream_url=url).first()
    if existing:
        return jsonify({'status': 'error', 'message': f'Channel with this URL already exists: {existing.name}'}), 400

    try:
        ch = Channel(
            name=data.get('name'),
            stream_url=url,
            logo_url=data.get('logo_url'),
            group_name=data.get('group_name'),
            epg_id=data.get('epg_id'),
            proxy_type=data.get('proxy_type', 'none'),
            is_original=data.get('is_original', False),
            is_passthrough=data.get('is_passthrough', False),
            is_public=data.get('is_public', False),
            owner_id=current_user.id
        )
        db.session.add(ch)
        db.session.flush()
        
        playlist_ids = data.get('selected_playlists', [])
        for p_id in playlist_ids:
            PlaylistService.add_channel_to_playlist(p_id, ch.id)
            
        db.session.commit()
        return jsonify({'status': 'ok', 'id': ch.id})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding channel: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@channels_bp.route('/<int:id>', methods=['PATCH', 'PUT'])
@login_required
def update_channel(id):
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)
    data = request.json
    
    new_url = data.get('stream_url', ch.stream_url)
    if new_url != ch.stream_url:
        # Check if new URL already exists elsewhere
        existing = Channel.query.filter(Channel.stream_url == new_url, Channel.id != id).first()
        if existing:
            return jsonify({'status': 'error', 'message': f'Another channel already uses this URL: {existing.name}'}), 400

    try:
        ch.name = data.get('name', ch.name)
        ch.stream_url = new_url
        ch.logo_url = data.get('logo_url', ch.logo_url)
        ch.group_name = data.get('group_name', ch.group_name)
        ch.epg_id = data.get('epg_id', ch.epg_id)
        ch.proxy_type = data.get('proxy_type', ch.proxy_type)
        ch.is_original = data.get('is_original', ch.is_original)
        ch.is_passthrough = data.get('is_passthrough', ch.is_passthrough)
        ch.is_public = data.get('is_public', ch.is_public)
        
        playlist_ids = data.get('selected_playlists', [])
        from app.modules.playlists.models import PlaylistEntry
        PlaylistEntry.query.filter_by(channel_id=id).delete()
        for p_id in playlist_ids:
            PlaylistService.add_channel_to_playlist(p_id, id)
            
        db.session.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating channel {id}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@channels_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_channel(id):
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)

    db.session.delete(ch)
    db.session.commit()
    return jsonify({'status': 'ok'})

@channels_bp.route('/<int:id>/check', methods=['POST'])
@login_required
def check_channel(id):
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)
    from app.modules.health.services import HealthCheckService
    result = HealthCheckService.check_stream(id)
    return jsonify(result)

@channels_bp.route('/toggle-protection/<int:id>', methods=['POST'])
@login_required
def toggle_protection(id):
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)
    try:
        ch.is_original = not getattr(ch, 'is_original', False)
        db.session.commit()
        return jsonify({
            'status': 'ok', 
            'is_original': ch.is_original,
            'message': f"Channel {'protected' if ch.is_original else 'unprotected'}."
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@channels_bp.route('/toggle-public/<int:id>', methods=['POST'])
@login_required
def toggle_public(id):
    ch = Channel.query.get_or_404(id)
    check_channel_access(ch)
        
    try:
        ch.is_public = not getattr(ch, 'is_public', False)
        db.session.commit()
        return jsonify({
            'status': 'ok', 
            'is_public': ch.is_public,
            'message': f"Channel is now {'public' if ch.is_public else 'private'}."
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

# --- MONITORING APIs (Mounted at /api/streams) ---

streams_bp = Blueprint('streams', __name__)

@streams_bp.route('/active', methods=['GET'])
@login_required
def get_active_sessions():
    sessions = ActiveSessionManager.get_active_sessions()
    results = []
    for s in sessions:
        ch = Channel.query.get(s['channel_id'])
        if ch:
            try:
                check_channel_access(ch)
            except:
                continue
        results.append({
            'key': s.get('key'),
            'channel_name': ch.name if ch else 'Unknown',
            'logo_url': ch.logo_url if ch else None,
            'user': s['user'],
            'ip': s['ip'],
            'type': s['type'],
            'source': s.get('source', 'Unknown'),
            'bandwidth_kbps': s.get('bandwidth_kbps', 0),
            'start_time': s['start_time'].strftime('%H:%M:%S'),
            'duration': str(datetime.now() - s['start_time']).split('.')[0]
        })
    return jsonify(results)

@streams_bp.route('/<path:key>', methods=['DELETE'])
@login_required
def kill_session(key):
    success = ActiveSessionManager.remove_session(key)
    return jsonify({'status': 'ok' if success else 'error'})

# --- PLAYBACK & REDIRECTS (Compatibility) ---

@channels_bp.route('/play/<int:channel_id>', endpoint='play_channel')
@channels_bp.route('/smartlink/<int:channel_id>')
def play_channel(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user = validate_proxy_access(token) if token else None
    # check_channel_access(channel, user_override=user)
    
    # Passthrough channels block all VPS interaction
    if channel.is_passthrough:
        return redirect(channel.stream_url)

    channel.play_count = (channel.play_count or 0) + 1
    
    from app.modules.settings.services import SettingService
    if SettingService.get('ENABLE_HEALTH_SYSTEM', True):
        from app.modules.health.services import HealthCheckService
        HealthCheckService.trigger_passive_check(channel_id)
    
    db.session.commit()
    
    token = request.args.get('token')
    user_role = 'free' # Default to free if unauth
    
    if current_user.is_authenticated:
        user_role = current_user.role
    elif token:
        from app.modules.auth.models import User
        u = User.query.filter_by(api_token=token).first()
        if u: user_role = u.role
        
    # [3-TIER RBAC] Free users directly redirect to original source, bypassing VPS tracking/proxy
    if user_role == 'free':
        return redirect(channel.stream_url)

    token = token or (current_user.api_token if current_user.is_authenticated else None)
    proxy = request.args.get('forced') or getattr(channel, 'proxy_type', 'none')
    
    url_low = channel.stream_url.lower()
    play_url = channel.stream_url
    
    # Auto-extraction logic for non-direct links
    if not any(ext in url_low for ext in ['.m3u8', '.ts', '.mp4', '.mkv', '.flv']):
        from app.modules.channels.services import ExtractorService
        res = ExtractorService.extract_direct_url(channel.stream_url)
        if res.get('success') and res.get('links'):
            play_url = res['links'][0]['url']
            url_low = play_url.lower()

    if proxy == 'hls' or '.m3u8' in url_low:
        return redirect(url_for('channels.play_hls', channel_id=channel.id, token=token))
    elif proxy == 'ts' or '.ts' in url_low or '.flv' in url_low:
        return redirect(url_for('channels.proxy_stream', url=play_url, channel_id=channel.id, token=token))
        
    return redirect(play_url)

@channels_bp.route('/play/preview')
def preview_channel():
    url = request.args.get('url')
    proxy = request.args.get('proxy', 'none')
    token = request.args.get('token')
    
    if not url:
        return abort(400)
        
    url_low = url.lower()
    play_url = url
    
    # Auto-extraction logic for non-direct links
    if not any(ext in url_low for ext in ['.m3u8', '.ts', '.mp4', '.mkv', '.flv']):
        from app.modules.channels.services import ExtractorService
        res = ExtractorService.extract_direct_url(url)
        if res.get('success') and res.get('links'):
            play_url = res['links'][0]['url']
            url_low = play_url.lower()

    if proxy == 'ts' or '.ts' in url_low or '.flv' in url_low:
        return redirect(url_for('channels.proxy_stream', url=play_url, token=token))
        
    return redirect(play_url)

# --- HLS PROXY ENGINE (Optimized for performance and matching) ---

@channels_bp.route('/hls-manifest/<int:channel_id>/index.m3u8', endpoint='play_hls')
def play_hls(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user_obj = validate_proxy_access(token)
    if not user_obj:
        logger.warning(f"HLS Proxy Denied: Invalid token {token[:10] if token else 'None'}...")
        abort(401)
        
    logger.debug(f"HLS Manifest Request: channel_id={channel_id}, user={getattr(user_obj, 'username', 'Unknown')}")
    # Access check removed for simplicity as requested by user
    # check_channel_access(channel, user_override=user_obj)
    
    ActiveSessionManager.update_session(channel.id, getattr(user_obj, 'username', 'Guest'), request.remote_addr, 'HLS Proxy', bandwidth_kbps=4500)
    
    from app.modules.health.services import HealthCheckService
    HealthCheckService.trigger_passive_check(channel_id)
    
    try:
        # Standardize URL and handle potential query parameters in base_url
        clean_stream_url = channel.stream_url.split('?')[0]
        base_url = clean_stream_url.rsplit('/', 1)[0]
        
        # Use simple session with generous timeout
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'}
        # Pass through query params if the source expects them (e.g. auth tokens)
        source_url = channel.stream_url
        resp = requests.get(source_url, headers=headers, timeout=15, verify=False)
        
        if resp.status_code != 200:
            logger.error(f"HLS Source Error: {resp.status_code} for {source_url}")
            abort(resp.status_code)

        m3u8_content = resp.text
        lines = m3u8_content.split('\n')
        new_lines = []
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            if not line.startswith('#'):
                # This is a URL (either variant playlist or segment)
                url_val = line
                if not url_val.startswith('http'):
                    url_val = f"{base_url}/{url_val}"
                
                # RECURSIVE PROXY: If child is also an m3u8, route it back through play_hls
                if '.m3u8' in url_val.split('?')[0].lower():
                    # We use _external=True to ensure compatibility with external players (Smartlink)
                    proxy_url = url_for('channels.play_hls_direct', url=url_val, token=token, _external=True)
                else:
                    # Media Segment
                    proxy_url = url_for('channels.proxy_hls_segment', token=token, url=url_val, _external=True)
                
                new_lines.append(proxy_url)
            else:
                new_lines.append(line)
        
        return Response('\n'.join(new_lines), mimetype='application/x-mpegurl')
    except Exception as e:
        logger.error(f"HLS Manifest Proxy Error: {e}", exc_info=True)
        abort(502)

@channels_bp.route('/hls-direct', endpoint='play_hls_direct')
def play_hls_direct():
    """Proxy for nested playlists that doesn't rely on a Channel ID from Database."""
    url = request.args.get('url')
    token = request.args.get('token')
    if not validate_proxy_access(token): abort(401)
    
    try:
        base_url = url.split('?')[0].rsplit('/', 1)[0]
        resp = requests.get(url, timeout=15, verify=False)
        lines = resp.text.split('\n')
        new_lines = []
        for line in lines:
            line = line.strip()
            if not line: continue
            if not line.startswith('#'):
                full_url = line if line.startswith('http') else f"{base_url}/{line}"
                if '.m3u8' in full_url.split('?')[0].lower():
                    proxy_url = url_for('channels.play_hls_direct', url=full_url, token=token, _external=True)
                else:
                    proxy_url = url_for('channels.proxy_hls_segment', token=token, url=full_url, _external=True)
                new_lines.append(proxy_url)
            else:
                new_lines.append(line)
        return Response('\n'.join(new_lines), mimetype='application/x-mpegurl')
    except Exception as e:
        logger.error(f"Nested HLS Proxy Error: {e}")
        abort(502)

@channels_bp.route('/hls-segment', endpoint='proxy_hls_segment')
def proxy_hls_segment():
    url = request.args.get('url')
    token = request.args.get('token')
    user = validate_proxy_access(token)
    if not user:
        logger.warning(f"HLS Segment Denied: Invalid token {token[:10] if token else 'None'} for {url}")
        abort(401)
    
    data = HLSEngine.get_segment(url)
    if not data: abort(404)
    return Response(data, mimetype='video/MP2T')

@channels_bp.route('/ts-proxy/<int:channel_id>', endpoint='play_ts')
def play_ts(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user = validate_proxy_access(token)
    if not user: abort(401)
    # check_channel_access(channel, user_override=user)
    
    ActiveSessionManager.update_session(channel.id, user, request.remote_addr, 'TS Proxy', bandwidth_kbps=8000)
    
    from app.modules.health.services import HealthCheckService
    HealthCheckService.trigger_passive_check(channel_id)
    
    return redirect(url_for('channels.proxy_stream', url=channel.stream_url, channel_id=channel.id, token=token))


@channels_bp.route('/track/<int:channel_id>')
def track_redirect(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user_role = 'free'
    user = None
    if current_user.is_authenticated:
        user_role = current_user.role
        user = current_user
    elif token:
        from app.modules.auth.models import User
        u = User.query.filter_by(api_token=token).first()
        if u: 
            user_role = u.role
            user = u
            
    # Passive health check trigger (MOVE TO TOP to ensure it runs even for free/unauthenticated)
    from app.modules.health.services import HealthCheckService
    HealthCheckService.trigger_passive_check(channel_id)
    
    # PERMISSIVE: Default to admin to enable tracking features for everyone (as requested)
    if not user or user_role == 'free':
        user_role = 'admin'
        
    logger.debug(f"Track Redirect: channel_id={channel_id}, user_role={user_role}, user={user.username if hasattr(user, 'username') else 'Guest'}")

    if user_role == 'free':
        # This block is now effectively bypassed by the logic above, but kept for structure
        return redirect(channel.stream_url)

    user_obj = validate_proxy_access(token)
    # user_obj will now be a GuestUser if token is missing, so this passes
    if not user_obj: abort(401)
    
    ActiveSessionManager.update_session(channel.id, getattr(user_obj, 'username', 'Guest'), request.remote_addr, 'Tracking', bandwidth_kbps=4000)
    
    url_low = channel.stream_url.lower()
    if '.m3u8' in url_low:
        return redirect(url_for('channels.play_hls', channel_id=channel.id, token=token))
    elif '.flv' in url_low or '.ts' in url_low:
        return redirect(url_for('channels.proxy_stream', url=channel.stream_url, channel_id=channel.id, token=token))
        
    return redirect(channel.stream_url)

@channels_bp.route('/proxy/ts')
def proxy_stream():
    url = request.args.get('url')
    cid = request.args.get('channel_id')
    token = request.args.get('token')
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': url.rsplit('/', 1)[0] + '/' if '/' in url else url
    }
    
    q, sid = StreamManager.get_source_stream(url, headers=headers)
    def generate():
        try:
            while True:
                chunk = q.get(timeout=20)
                if chunk is None: break
                yield chunk
        finally:
            StreamManager.remove_client(sid, q)
            
    is_flv = '.flv' in url.lower().split('?')[0]
    mimetype = 'video/x-flv' if is_flv else 'video/mp2t'
    
    return Response(stream_with_context(generate()), content_type=mimetype)

@channels_bp.route('/player_ping', methods=['POST'])
def player_ping():
    data = request.json or {}
    cid = data.get('channel_id')
    sec = data.get('seconds', 30)
    ch = Channel.query.get(cid)
    if not ch: return jsonify({'error': 'NF'}), 404
    
    bitrate = 8.0 # Default HD estimate
    ch.total_watch_seconds = (ch.total_watch_seconds or 0) + sec
    ch.total_bandwidth_mb = (ch.total_bandwidth_mb or 0) + (bitrate * sec) / 8
    
    from app.modules.settings.services import SettingService
    if SettingService.get('ENABLE_HEALTH_SYSTEM', True):
        from app.modules.health.services import HealthCheckService
        HealthCheckService.trigger_passive_check(cid)
    
    ActiveSessionManager.update_session(cid, current_user.username if current_user.is_authenticated else 'Guest', request.remote_addr, 'Web Player', bandwidth_kbps=int(bitrate * 1024))
    db.session.commit()
    return jsonify({'status': 'ok'})

@channels_bp.route('/scan-web', methods=['POST'])
@login_required
def scan_web():
    if current_user.role not in ['admin', 'vip']:
        return jsonify({'error': 'Premium feature. VIP or Admin required.'}), 403
        
    data = request.json or {}
    url = data.get('url')
    deep = data.get('deep', False)
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    logger.info(f"User {current_user.username} initiating {'DEEP ' if deep else ''}web scan for: {url}")
    res = ExtractorService.extract_direct_url(url, deep_scan=deep)
    return jsonify(res)
