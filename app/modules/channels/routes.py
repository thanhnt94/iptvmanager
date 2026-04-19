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
from app.modules.channels.services import ChannelService, EPGService, ActiveSessionManager, StreamManager, HLSEngine
from app.modules.playlists.services import PlaylistService
from app.core.database import db

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
channels_bp = Blueprint('channels', __name__)
logger = logging.getLogger('iptv')

def validate_proxy_access(token=None):
    if current_user.is_authenticated:
        return current_user.username
    if token:
        from app.modules.auth.models import User
        from app.modules.playlists.models import PlaylistProfile
        user = User.query.filter_by(api_token=token).first()
        if user: return user.username
        playlist = PlaylistProfile.query.filter_by(security_token=token).first()
        if playlist: return f"Playlist: {playlist.name}"
    from app.modules.auth.models import TrustedIP
    ip = request.remote_addr
    trusted = TrustedIP.query.filter_by(ip_address=ip).first()
    if trusted: return f"Trusted IP: {ip}"
    return None

# --- REST DATA APIs (Mounted at /api/channels) ---

@channels_bp.route('/', methods=['GET'])
@login_required
def list_channels():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search = request.args.get('search', '')
    group = request.args.get('group', '')
    status = request.args.get('status', '')
    
    query = Channel.query
    if search:
        query = query.filter(Channel.name.ilike(f'%{search}%'))
    if group:
        query = query.filter(Channel.group_name == group)
    if status:
        query = query.filter(Channel.status == status)
        
    pagination = query.order_by(Channel.name).paginate(page=page, per_page=per_page)
    
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
            'stream_format': ch.stream_format,
            'stream_type': ch.stream_type,
            'quality': ch.quality,
            'resolution': ch.resolution,
            'latency': ch.latency or 0,
            'is_original': ch.is_original,
            'last_checked': ch.last_checked_at.isoformat() if hasattr(ch, 'last_checked_at') and ch.last_checked_at else None,
            'play_links': {
                'smart': url_for('channels.play_channel', channel_id=ch.id, token=token, _external=True),
                'tracking': url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True),
                'hls': url_for('channels.play_hls', channel_id=ch.id, token=token, _external=True),
                'ts': url_for('channels.play_ts', channel_id=ch.id, token=token, _external=True)
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
            'play_links': {
                'smart': url_for('channels.play_channel', channel_id=ch.id, token=token, _external=True),
                'tracking': url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True),
                'hls': url_for('channels.play_hls', channel_id=ch.id, token=token, _external=True),
                'ts': url_for('channels.play_ts', channel_id=ch.id, token=token, _external=True)
            }
        },
        'memberships': memberships
    })

@channels_bp.route('/add', methods=['POST'])
@login_required
def add_channel():
    data = request.json
    ch = Channel(
        name=data.get('name'),
        stream_url=data.get('stream_url'),
        logo_url=data.get('logo_url'),
        group_name=data.get('group_name'),
        epg_id=data.get('epg_id'),
        proxy_type=data.get('proxy_type', 'none'),
        is_original=data.get('is_original', False)
    )
    db.session.add(ch)
    db.session.flush()
    
    playlist_ids = data.get('selected_playlists', [])
    for p_id in playlist_ids:
        PlaylistService.add_channel_to_playlist(p_id, ch.id)
        
    db.session.commit()
    return jsonify({'status': 'ok', 'id': ch.id})

@channels_bp.route('/<int:id>', methods=['PATCH', 'PUT'])
@login_required
def update_channel(id):
    ch = Channel.query.get_or_404(id)
    data = request.json
    ch.name = data.get('name', ch.name)
    ch.stream_url = data.get('stream_url', ch.stream_url)
    ch.logo_url = data.get('logo_url', ch.logo_url)
    ch.group_name = data.get('group_name', ch.group_name)
    ch.epg_id = data.get('epg_id', ch.epg_id)
    ch.proxy_type = data.get('proxy_type', ch.proxy_type)
    ch.is_original = data.get('is_original', ch.is_original)
    
    playlist_ids = data.get('selected_playlists', [])
    from app.modules.playlists.models import PlaylistEntry
    PlaylistEntry.query.filter_by(channel_id=id).delete()
    for p_id in playlist_ids:
        PlaylistService.add_channel_to_playlist(p_id, id)
        
    db.session.commit()
    return jsonify({'status': 'ok'})

@channels_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_channel(id):
    ch = Channel.query.get_or_404(id)
    db.session.delete(ch)
    db.session.commit()
    return jsonify({'status': 'ok'})

@channels_bp.route('/<int:id>/check', methods=['POST'])
@login_required
def check_channel(id):
    from app.modules.health.services import HealthCheckService
    result = HealthCheckService.check_stream(id)
    return jsonify(result)

# --- MONITORING APIs (Mounted at /api/streams) ---

streams_bp = Blueprint('streams', __name__)

@streams_bp.route('/active', methods=['GET'])
@login_required
def get_active_sessions():
    sessions = ActiveSessionManager.get_active_sessions()
    results = []
    for s in sessions:
        ch = Channel.query.get(s['channel_id'])
        results.append({
            'key': s.get('key'),
            'channel_name': ch.name if ch else 'Unknown',
            'channel_logo': ch.logo_url if ch else None,
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
    channel.play_count = (channel.play_count or 0) + 1
    db.session.commit()
    
    token = request.args.get('token') or (current_user.api_token if current_user.is_authenticated else None)
    proxy = request.args.get('forced') or getattr(channel, 'proxy_type', 'none')
    
    url_low = channel.stream_url.lower()
    play_url = channel.stream_url
    
    # Auto-extraction logic for non-direct links
    if not any(ext in url_low for ext in ['.m3u8', '.ts', '.mp4', '.mkv']):
        from app.modules.channels.services import ExtractorService
        res = ExtractorService.extract_direct_url(channel.stream_url)
        if res.get('success') and res.get('links'):
            play_url = res['links'][0]['url']
            url_low = play_url.lower()

    if proxy == 'hls' or '.m3u8' in url_low:
        return redirect(url_for('channels.play_hls', channel_id=channel.id, token=token))
    elif proxy == 'ts' or '.ts' in url_low or '.flv' in url_low:
        return redirect(url_for('channels.play_ts', channel_id=channel.id, token=token))
        
    return redirect(play_url)

# --- HLS PROXY ENGINE (Optimized for performance and matching) ---

@channels_bp.route('/hls-manifest/<int:channel_id>/index.m3u8', endpoint='play_hls')
def play_hls(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user = validate_proxy_access(token)
    if not user: abort(401)
    
    ActiveSessionManager.update_session(channel.id, user, request.remote_addr, 'HLS Proxy', bandwidth_kbps=4500)
    
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
    if not validate_proxy_access(token): abort(401)
    
    data = HLSEngine.get_segment(url)
    if not data: abort(404)
    return Response(data, mimetype='video/MP2T')

@channels_bp.route('/ts-proxy/<int:channel_id>', endpoint='play_ts')
def play_ts(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user = validate_proxy_access(token)
    if not user: abort(401)
    
    ActiveSessionManager.update_session(channel.id, user, request.remote_addr, 'TS Proxy', bandwidth_kbps=8000)
    return redirect(url_for('channels.proxy_stream', url=channel.stream_url, channel_id=channel.id, token=token))


@channels_bp.route('/track/<int:channel_id>')
def track_redirect(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    token = request.args.get('token')
    user = validate_proxy_access(token)
    if not user: abort(401)
    ActiveSessionManager.update_session(channel.id, user, request.remote_addr, 'Redirect', bandwidth_kbps=4000)
    return redirect(channel.stream_url)

@channels_bp.route('/proxy/ts')
def proxy_stream():
    url = request.args.get('url')
    cid = request.args.get('channel_id')
    token = request.args.get('token')
    user = validate_proxy_access(token)
    if not user: abort(401)
    
    q, sid = StreamManager.get_source_stream(url)
    def generate():
        try:
            while True:
                chunk = q.get(timeout=20)
                if chunk is None: break
                yield chunk
        finally:
            StreamManager.remove_client(sid, q)
            
    return Response(stream_with_context(generate()), content_type='video/mp2t')

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
    
    ActiveSessionManager.update_session(cid, current_user.username if current_user.is_authenticated else 'Guest', request.remote_addr, 'Web Player', bandwidth_kbps=int(bitrate * 1024))
    db.session.commit()
    return jsonify({'status': 'ok'})
