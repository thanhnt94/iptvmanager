from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, current_app, Response, stream_with_context
from flask_login import login_required, current_user
import requests
import json
from datetime import datetime, timedelta
import time
from app.modules.channels.models import Channel, EPGSource, EPGData
from app.modules.channels.services import ChannelService, EPGService, ActiveSessionManager, StreamManager
from app.modules.playlists.services import PlaylistService
from app.core.database import db
import time
import logging
import queue

channels_bp = Blueprint('channels', __name__, template_folder='templates')
logger = logging.getLogger('iptv')

# --- Removed Duplicate validate_proxy_access (Consolidated at L666) ---
# --- End of duplicate removal ---

@channels_bp.route('/')
@login_required
def index():
    page = request.args.get('page', 1, type=int)
    search = request.args.get('search', '')
    group = request.args.get('group', '')
    stream_type = request.args.get('stream_type', '')
    status = request.args.get('status', '')
    quality = request.args.get('quality', '')
    res_filter = request.args.get('resolution', '')
    audio = request.args.get('audio', '')
    sort = request.args.get('sort', '')
    is_original = request.args.get('is_original', '')
    stream_format = request.args.get('format', '')

    pagination = ChannelService.get_all_channels(
        page=page, 
        search=search, 
        group_filter=group,
        stream_type_filter=stream_type,
        status_filter=status,
        quality_filter=quality,
        res_filter=res_filter,
        audio_filter=audio,
        sort=sort,
        is_original_filter=is_original,
        format_filter=stream_format
    )
    
    # Calculate stats
    stats = {
        'total': Channel.query.count(),
        'live': Channel.query.filter_by(status='live').count(),
        'die': Channel.query.filter_by(status='die').count(),
        'unknown': Channel.query.filter((Channel.status == None) | (Channel.status == 'unknown')).count()
    }
    
    distinct_groups = ChannelService.get_distinct_groups()
    distinct_res = ChannelService.get_distinct_resolutions()
    distinct_audio = ChannelService.get_distinct_audio_codecs()
    distinct_formats = ChannelService.get_distinct_formats()
    
    from app.modules.playlists.models import PlaylistProfile
    playlists = PlaylistProfile.query.all()
    
    return render_template('channels/index.html', 
                           channels=pagination.items, 
                           pagination=pagination,
                           stats=stats,
                           search=search,
                           group=group,
                           group_filter=group, # ensure compatibility
                           stream_type_filter=stream_type,
                           status_filter=status,
                           quality_filter=quality,
                           res_filter=res_filter,
                           is_original=is_original,
                           audio_filter=audio,
                           sort=sort,
                           stream_format=stream_format,
                           distinct_groups=distinct_groups,
                           distinct_res=distinct_res,
                           distinct_audio=distinct_audio,
                           distinct_formats=distinct_formats,
                           playlists=playlists)

@channels_bp.route('/add', methods=['GET', 'POST'])
@login_required
def add_channel():
    from app.modules.playlists.models import PlaylistProfile
    from app.modules.playlists.services import PlaylistService
    
    prefill_url = request.args.get('stream_url', '')
    
    if request.method == 'POST':
        # 1. Create the channel
        new_ch = ChannelService.create_channel(request.form)
        if new_ch:
            # 2. Sync playlist memberships with group IDs
            selected_playlists = request.form.getlist('playlists')
            playlist_data = {}
            for pid in selected_playlists:
                group_id = request.form.get(f'group_{pid}')
                playlist_data[pid] = group_id
                
            PlaylistService.sync_channel_playlists(new_ch.id, playlist_data, request.form.to_dict(flat=False).get('new_group'))
            
            # 3. IMMEDIATE HEALTH CHECK
            # Perform a full scan right now so the user sees technical specs immediately
            from app.modules.health.services import HealthCheckService
            HealthCheckService.check_stream(new_ch.id)
            
            flash('Channel added successfully!', 'success')
            return redirect(url_for('channels.index'))
        else:
            # Handle potential duplicate error from ChannelService
            flash('Error adding channel. It might already exist.', 'danger')
            return render_template('channels/add.html', 
                                 form_data=request.form, 
                                 distinct_groups=ChannelService.get_distinct_groups(),
                                 all_playlists=PlaylistProfile.query.filter_by(is_system=False).all())

    # GET: fetch data for the enhanced UI
    return render_template('channels/add.html', 
                         prefill_url=prefill_url,
                         distinct_groups=ChannelService.get_distinct_groups(),
                         all_playlists=PlaylistProfile.query.filter_by(is_system=False).all())

@channels_bp.route('/edit/<int:channel_id>', methods=['GET', 'POST'])
@login_required
def edit_channel(channel_id):
    from app.modules.playlists.models import PlaylistProfile, PlaylistEntry
    from app.modules.playlists.services import PlaylistService
    
    channel = Channel.query.get_or_404(channel_id)
    
    if request.method == 'POST':
        ChannelService.update_channel(channel_id, request.form)
        
        # Sync playlist memberships with group IDs
        selected_playlists = request.form.getlist('playlists')
        playlist_data = {}
        for pid in selected_playlists:
            group_id = request.form.get(f'group_{pid}')
            playlist_data[pid] = group_id
            
        PlaylistService.sync_channel_playlists(channel_id, playlist_data)
        
        flash('Channel updated successfully!')
        return redirect(url_for('channels.index'))
    
    # For GET: fetch all available playlists (non-system) with their groups
    all_playlists = PlaylistProfile.query.filter_by(is_system=False).all()
    # Fetch current playlist memberships mapping pid -> group_id
    current_entries = PlaylistEntry.query.filter_by(channel_id=channel_id).all()
    current_memberships = {e.playlist_id: e.group_id for e in current_entries}
    
    # Navigation: Find previous and next channel IDs
    prev_channel = Channel.query.filter(Channel.id < channel_id).order_by(Channel.id.desc()).first()
    next_channel = Channel.query.filter(Channel.id > channel_id).order_by(Channel.id.asc()).first()
    prev_id = prev_channel.id if prev_channel else None
    next_id = next_channel.id if next_channel else None
    
    return render_template('channels/edit.html', 
                         channel=channel, 
                         all_playlists=all_playlists,
                         current_memberships=current_memberships,
                         prev_id=prev_id,
                         next_id=next_id)

@channels_bp.route('/delete/<int:channel_id>', methods=['POST'])
@login_required
def delete_channel(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    db.session.delete(channel)
    db.session.commit()
    flash('Channel deleted successfully.', 'success')
    return redirect(url_for('channels.index'))

@channels_bp.route('/api/clean_dead_channels', methods=['POST'])
@login_required
def clean_dead_channels():
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
        
    # Find channels that are 'die' and NOT 'is_original'
    # We use (Channel.is_original == False) | (Channel.is_original == None) for safety
    query = Channel.query.filter(
        Channel.status == 'die',
        db.or_(Channel.is_original == False, Channel.is_original == None)
    )
    
    count = query.count()
    query.delete(synchronize_session=False)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'deleted_count': count,
        'message': f'Đã xoá thành công {count} kênh die.'
    })

@channels_bp.route('/api/toggle_original/<int:channel_id>', methods=['POST'])
@login_required
def toggle_original(channel_id):
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
        
    channel = Channel.query.get_or_404(channel_id)
    channel.is_original = not channel.is_original
    db.session.commit()
    
    return jsonify({
        'success': True,
        'is_original': channel.is_original,
        'message': f'Đã cập nhật trạng thái bảo vệ cho kênh: {channel.name}'
    })

@channels_bp.route('/web-player')
@channels_bp.route('/web-player/<int:channel_id>')
@login_required
def web_player(channel_id=None):
    from app.modules.playlists.models import PlaylistProfile
    from app.modules.auth.services import AuthService
    
    if current_user.role == 'admin':
        playlists = PlaylistProfile.query.all()
    else:
        playlists = AuthService.get_user_playlists(current_user.id)
        
    initial_id = channel_id or request.args.get('id', type=int)
    return render_template('channels/player.html', playlists=playlists, initial_id=initial_id)

@channels_bp.route('/api/channel/<int:channel_id>')
@login_required
def get_channel_info(channel_id):
    from app.modules.playlists.models import PlaylistEntry
    channel = Channel.query.get_or_404(channel_id)
    
    # Try to find which playlist this channel belongs to
    entry = PlaylistEntry.query.filter_by(channel_id=channel_id).first()
    playlist_id = entry.playlist_id if entry else None
    
    return jsonify({
        'status': 'ok',
        'channel': {
            'id': channel.id,
            'name': channel.name,
            'logo': channel.logo_url,
            'group': channel.group_name or 'Uncategorized',
            'play_url': url_for('channels.play_channel', channel_id=channel.id, token=current_user.api_token, _external=True),
            'stream_url': channel.stream_url,
            'playlist_id': playlist_id,
            'stream_type': channel.stream_type or 'live',
            'stream_format': channel.stream_format
        }
    })

@channels_bp.route('/web-player/channels/<int:playlist_id>')
@login_required
def player_playlist_channels(playlist_id):
    from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
    from app.modules.auth.models import UserPlaylist
    
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 100, type=int)
    group_filter = request.args.get('group')
    q = request.args.get('q', '')
    offset = (page - 1) * limit
    
    profile = PlaylistProfile.query.get_or_404(playlist_id)
    
    # Permission Check
    if current_user.role != 'admin':
        access = UserPlaylist.query.filter_by(user_id=current_user.id, playlist_id=playlist_id).first()
        if not access:
            return jsonify({'status': 'error', 'message': 'Access denied'}), 403
            
    channels_data = []
    total_count = 0

    if profile.is_system:
        # For system "All Channels" playlist
        query = Channel.query
        if group_filter:
            query = query.filter(Channel.group_name == group_filter)
        if q:
            query = query.filter(Channel.name.ilike(f'%{q}%'))
            
        total_count = query.count()
        channels = query.order_by(Channel.name).offset(offset).limit(limit).all()
        for channel in channels:
            channels_data.append({
                'id': channel.id,
                'name': channel.name,
                'logo': channel.logo_url,
                'group': channel.group_name or 'Uncategorized',
                'status': channel.status,
                'quality': channel.quality or 'N/A',
                'resolution': channel.resolution or 'SD',
                'play_url': url_for('channels.play_channel', channel_id=channel.id, token=current_user.api_token, _external=True),
                'stream_url': channel.stream_url,
                'stream_type': channel.stream_type,
                'stream_format': channel.stream_format,
                'proxy_type': channel.proxy_type or 'none'
            })
    else:
        # Fetch Channels ordered by index for custom playlists
        query = db.session.query(PlaylistEntry, Channel, PlaylistGroup.name.label('group_name'))\
            .join(Channel, PlaylistEntry.channel_id == Channel.id)\
            .outerjoin(PlaylistGroup, PlaylistEntry.group_id == PlaylistGroup.id)\
            .filter(PlaylistEntry.playlist_id == playlist_id)
        
        if group_filter:
            query = query.filter(PlaylistGroup.name == group_filter)
        if q:
            query = query.filter(Channel.name.ilike(f'%{q}%'))
        
        total_count = query.count()
        entries = query.order_by(PlaylistEntry.order_index).offset(offset).limit(limit).all()
            
        for entry, channel, group_name in entries:
            channels_data.append({
                'id': channel.id,
                'name': channel.name,
                'logo': channel.logo_url,
                'group': group_name or 'Uncategorized',
                'status': channel.status,
                'quality': channel.quality or 'N/A',
                'resolution': channel.resolution or 'SD',
                'play_url': url_for('channels.play_channel', channel_id=channel.id, token=current_user.api_token, _external=True),
                'stream_url': channel.stream_url,
                'stream_type': channel.stream_type,
                'stream_format': channel.stream_format,
                'proxy_type': channel.proxy_type or 'none'
            })
        
    return jsonify({
        'status': 'ok', 
        'channels': channels_data,
        'has_more': (offset + limit) < total_count,
        'page': page,
        'total': total_count
    })

@channels_bp.route('/web-player/categories/<int:playlist_id>')
@login_required
def player_playlist_categories(playlist_id):
    from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
    
    profile = PlaylistProfile.query.get_or_404(playlist_id)
    
    if profile.is_system:
        categories = db.session.query(Channel.group_name).distinct().filter(Channel.group_name != None).all()
        categories = [c[0] for c in categories]
    else:
        categories = db.session.query(PlaylistGroup.name).filter_by(playlist_id=playlist_id).distinct().all()
        categories = [c[0] for c in categories]
        
    return jsonify({'status': 'ok', 'categories': sorted(categories)})

@channels_bp.route('/vlc-launcher/<int:channel_id>')
def vlc_launcher(channel_id):
    token = request.args.get('token')
    channel = Channel.query.get_or_404(channel_id)
    playback_url = url_for('channels.play_channel', channel_id=channel.id, token=token, _external=True)
    
    m3u_content = f"#EXTM3U\n#EXTINF:-1,{channel.name}\n{playback_url}"
    return Response(
        m3u_content,
        mimetype='application/x-mpegURL',
        headers={'Content-Disposition': f'attachment; filename=play_{channel_id}.m3u'}
    )

@channels_bp.route('/check/<int:channel_id>', methods=['POST'])
@login_required
def check_channel(channel_id):
    from app.modules.health.services import HealthCheckService
    from datetime import datetime
    
    HealthCheckService.check_stream(channel_id)
    channel = Channel.query.get(channel_id)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('ajax'):
        return jsonify({
            'success': True,
            'status': channel.status,
            'stream_type': channel.stream_type,
            'stream_format': channel.stream_format,
            'quality': channel.quality,
            'resolution': channel.resolution,
            'audio_codec': channel.audio_codec,
            'latency': round(channel.latency, 1) if channel.latency else 0,
            'last_checked': channel.last_checked_at.strftime('%Y-%m-%d %H:%M') if channel.last_checked_at else 'Never'
        })
        
    flash('Channel check completed!')
    return redirect(url_for('channels.index'))

@channels_bp.route('/play_vlc/<int:channel_id>', methods=['POST'])
def play_vlc(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    # Include the token for authorized playback in VLC
    wrapper_url = url_for('channels.play_channel', channel_id=channel_id, token=current_user.api_token, _external=True)
    success = ChannelService.play_with_vlc(wrapper_url)
    return jsonify({'success': success})

@channels_bp.route('/epg/sources')
def epg_sources():
    sources = EPGSource.query.all()
    return render_template('channels/epg_sources.html', sources=sources)

@channels_bp.route('/epg')
def epg_management():
    from app.modules.channels.services import EPGService
    sources = EPGService.get_sources()
    return render_template('channels/epg.html', sources=sources)

@channels_bp.route('/epg/add', methods=['POST'])
def add_epg_source():
    from app.modules.channels.services import EPGService
    name = request.form.get('name')
    url = request.form.get('url')
    if name and url:
        EPGService.add_source(name, url)
    return redirect(url_for('channels.epg_management'))

@channels_bp.route('/epg/delete/<int:id>', methods=['POST'])
def delete_epg_source(id):
    from app.modules.channels.services import EPGService
    EPGService.delete_source(id)
    return redirect(url_for('channels.epg_management'))

@channels_bp.route('/epg/sync/<int:id>', methods=['POST'])
def sync_epg(id):
    from app.modules.channels.services import EPGService
    result = EPGService.sync_epg(id)
    return jsonify(result)
@channels_bp.route('/play/<int:channel_id>')
@channels_bp.route('/smartlink/<int:channel_id>')
def play_channel(channel_id):
    """
    Playback redirector that obfuscates the original URL and 
    performs a quick health check on access (crowdsourced status).
    Now also triggers a background metadata refresh if live.
    """
    import threading
    from app.modules.health.services import HealthCheckService
    
    channel = Channel.query.get_or_404(channel_id)
    
    # 1. Update Play Count (Initial)
    channel.play_count = (channel.play_count or 0) + 1
    channel.total_watch_seconds = (channel.total_watch_seconds or 0) + 1 # Initial ping
    db.session.commit()
    
    # 1. Background health check & Metadata refresh
    def _bg_check(app, cid):
        with app.app_context():
            from app.modules.health.services import HealthCheckService
            HealthCheckService.check_stream(cid)
    
    import threading
    threading.Thread(target=_bg_check, args=(current_app._get_current_object(), channel_id)).start()
    
    token = request.args.get('token')
    
    # SMART AUTH: If no token provided, automatically use the Admin token 
    from app.modules.auth.models import User, TrustedIP
    if not token:
        admin_user = User.query.filter_by(role='admin').first()
        if admin_user: token = admin_user.api_token
    
    # TRUST IP LOGIC
    if token:
        from app.modules.playlists.models import PlaylistProfile
        # Check if token is valid (User or Playlist Profile)
        is_user = User.query.filter_by(api_token=token).first()
        is_playlist = PlaylistProfile.query.filter_by(security_token=token).first()
        
        if is_user or is_playlist:
            ip = request.remote_addr
            trusted = TrustedIP.query.filter_by(ip_address=ip).first()
            if not trusted:
                trusted = TrustedIP(ip_address=ip)
                db.session.add(trusted)
                db.session.commit()

    # 2. On-the-fly Extraction for Web Links
    url_low = channel.stream_url.lower()
    is_direct = any(ext in url_low for ext in ['.m3u8', '.ts', '.mp4', '.mkv', '.mp3', '.aac', 'playlist', 'udp://', 'rtp://', 'rtmp://'])
    play_url = channel.stream_url
    audio_url = None
    
    if not is_direct:
        logger.info(f"SmartGateway: Extraction needed for {channel.name}")
        from app.modules.channels.services import ExtractorService
        ext_res = ExtractorService.extract_direct_url(channel.stream_url)
        if ext_res.get('success') and ext_res.get('links'):
            # YouTube/HQ check: if 2 links return, assume Video and Audio
            links = ext_res['links']
            if len(links) >= 2 and any('googlevideo' in l['url'] for l in links):
                play_url = links[0]['url']
                audio_url = links[1]['url']
                logger.info(f"SmartGateway: Multi-stream extraction (HQ Video + Audio)")
            else:
                play_url = links[0]['url']
            url_low = play_url.lower() # Re-detect based on real link

    # 3. Detect Format for Real Play URL
    format_low = (channel.stream_format or '').lower()
    is_hls = '.m3u8' in url_low or 'playlist' in url_low or 'm3u8' in format_low or 'hls' in format_low
    is_ts = '.ts' in url_low or 'mpegts' in url_low or 'type=ts' in url_low or 'ts' in format_low
    
    from app.modules.settings.services import SettingService
    enable_stats = SettingService.get('ENABLE_PROXY_STATS', True)
    enable_ts_proxy = SettingService.get('ENABLE_TS_PROXY', True)
    
    proxy_type = getattr(channel, 'proxy_type', 'default')
    
    # 3.1 HQ Multi-stream Redirection
    if audio_url:
        logger.info(f"SmartGateway: Redirecting to HQ Merger for {channel.name}")
        return redirect(url_for('channels.proxy_merge', v=play_url, a=audio_url, channel_id=channel.id, token=token))

    # 3.2 Force Modes
    if proxy_type == 'hls':
        return redirect(url_for('channels.proxy_hls_manifest', channel_id=channel.id, token=token, url=play_url))
    elif proxy_type == 'ts':
        return redirect(url_for('channels.proxy_stream', url=play_url, token=token, channel_id=channel.id))
    elif proxy_type == 'tracking':
        return redirect(url_for('channels.track_redirect', channel_id=channel.id, token=token))
    elif proxy_type == 'direct' or proxy_type == 'none':
        return redirect(play_url)
        
    # 3.3 Smart Mode
    if is_hls:
        # For HLS, we SHOULD proxy the manifest to bypass CORS (YouTube Live uses this)
        return redirect(url_for('channels.proxy_hls_manifest', channel_id=channel.id, token=token, url=play_url))
    elif is_ts:
        if enable_ts_proxy:
            return redirect(url_for('channels.proxy_stream', url=play_url, token=token, channel_id=channel.id))
    
    # Fallback
    if enable_stats:
        return redirect(url_for('channels.track_redirect', channel_id=channel.id, token=token))
    return redirect(play_url)

@channels_bp.route('/api/stats/<int:channel_id>')
@login_required
def get_channel_stats(channel_id):
    channel = Channel.query.get_or_404(channel_id)
    
    # Format duration
    hours = channel.total_watch_seconds // 3600
    minutes = (channel.total_watch_seconds % 3600) // 60
    seconds = channel.total_watch_seconds % 60
    duration_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    return jsonify({
        'status': 'ok',
        'stats': {
            'id': channel.id,
            'name': channel.name,
            'play_count': channel.play_count,
            'total_watch_time': duration_str,
            'bandwidth_mb': round(channel.total_bandwidth_mb, 2),
            'last_checked': channel.last_checked_at.strftime('%Y-%m-%d %H:%M') if channel.last_checked_at else 'Never',
            'created_at': channel.created_at.strftime('%Y-%m-%d %H:%M'),
            'resolution': channel.resolution or 'N/A',
            'stream_format': channel.stream_format.upper() if channel.stream_format else 'N/A',
            'stream_type': (channel.stream_type or 'live').upper(),
            'quality': (channel.quality or 'N/A').title(),
            'video_codec': channel.video_codec or 'N/A',
            'audio_codec': channel.audio_codec or 'N/A',
            'bitrate': f"{channel.bitrate} kbps" if channel.bitrate else 'N/A',
            'error_message': channel.error_message
        }
    })

@channels_bp.route('/api/scan_status')
def get_scan_status():
    from app.modules.health.services import HealthCheckService
    return jsonify(HealthCheckService.get_status())

_heartbeat_throttles = {} # (ip, channel_id) -> last_time

@channels_bp.route('/api/player_ping', methods=['POST'])
def player_ping():
    """
    Heartbeat API called by web player every 20s.
    Estimates bandwidth based on resolution.
    Includes server-side throttling (max 1 per 10s per IP/Channel) to prevent storms.
    """
    data = request.json or {}
    channel_id = data.get('channel_id')
    seconds = data.get('seconds', 30)
    
    if not channel_id:
        return jsonify({'error': 'No channel_id'}), 400

    # 1. Server-side Throttling
    now = time.time()
    ip = request.remote_addr
    throttle_key = (ip, channel_id)
    last_time = _heartbeat_throttles.get(throttle_key, 0)
    
    # If less than 10 seconds since last ping, ignore but return OK to satisfy client
    if now - last_time < 10:
        return jsonify({'status': 'throttled', 'info': 'too frequent'})
    
    _heartbeat_throttles[throttle_key] = now
    
    # 2. Process Heartbeat
        
    channel = Channel.query.get(channel_id)
    if not channel:
        return jsonify({'error': 'Channel not found'}), 404
        
    bitrate = 2.0 
    if channel.resolution:
        res = channel.resolution.lower()
        if '3840' in res or '4k' in res: bitrate = 25.0
        elif '1920' in res or '1080' in res: bitrate = 8.0
        elif '1280' in res or '720' in res: bitrate = 4.0
    
    mb_used = (bitrate * seconds) / 8
    channel.total_watch_seconds += seconds
    channel.total_bandwidth_mb += mb_used
    
    # Update Real-time Session with source info
    from app.modules.channels.services import ActiveSessionManager
    # Calculate kbps: bitrate (Mbps) * 1024
    kbps = int(bitrate * 1024)
    ActiveSessionManager.update_session(
        channel.id, 
        current_user.username if current_user.is_authenticated else 'Guest', 
        request.remote_addr, 
        'Web Player',
        bandwidth_kbps=kbps,
        user_agent=request.headers.get('User-Agent')
    )
    
    db.session.commit()
    return jsonify({'status': 'ok'})

def validate_proxy_access(token=None):
    """Universal validator for proxy and stream access (Returns username or None)"""
    if current_user.is_authenticated:
        return current_user.username
        
    if token:
        from app.modules.auth.models import User
        from app.modules.playlists.models import PlaylistProfile
        # Check User API Token
        user = User.query.filter_by(api_token=token).first()
        if user: return user.username
        # Check Playlist Security Token
        playlist = PlaylistProfile.query.filter_by(security_token=token).first()
        if playlist: return f"Playlist: {playlist.name}"
        
    # IP-BASED BYPASS
    from app.modules.auth.models import TrustedIP
    ip = request.remote_addr
    trusted = TrustedIP.query.filter_by(ip_address=ip).first()
    if trusted: 
        logger.debug(f"Proxy Auth: Success via Trusted IP {ip}")
        return f"Trusted IP: {ip}"
    
    logger.warning(f"Proxy Auth: FAILED for IP {ip} (Token: {token})")
    return None

@channels_bp.route('/track/<int:channel_id>')
@channels_bp.route('/redirect/<int:channel_id>')
def track_redirect(channel_id):
    from app.modules.settings.services import SettingService
    if not SettingService.get('ENABLE_PROXY_STATS', True):
        return "Usage tracking is currently disabled.", 403
        
    token = request.args.get('token')
    username = validate_proxy_access(token)
    if not username:
        return "Unauthorized: Valid token required for tracking.", 401
        
    channel = Channel.query.get_or_404(channel_id)
    from app.modules.channels.services import ActiveSessionManager
    ActiveSessionManager.update_session(
        channel.id, 
        username, 
        request.remote_addr, 
        'Direct Link (Tracked)',
        user_agent=request.headers.get('User-Agent')
    )
    channel.play_count += 1
    db.session.commit()

    # On-the-fly Extraction logic (consistent with play_channel)
    url_low = channel.stream_url.lower()
    is_direct = any(ext in url_low for ext in ['.m3u8', '.ts', '.mp4', '.mkv', '.mp3', '.aac', 'playlist', 'udp://', 'rtp://', 'rtmp://'])
    play_url = channel.stream_url
    
    if not is_direct:
        from app.modules.channels.services import ExtractorService
        ext_res = ExtractorService.extract_direct_url(channel.stream_url)
        if ext_res.get('success') and ext_res.get('links'):
            play_url = ext_res['links'][0]['url']
            logger.info(f"Redirect: Extraction success for {channel.name}")

    # Background health check
    def _bg_check(app, cid):
        with app.app_context():
            from app.modules.health.services import HealthCheckService
            HealthCheckService.check_stream(cid)
    import threading
    threading.Thread(target=_bg_check, args=(current_app._get_current_object(), channel_id)).start()

    return redirect(play_url)

@channels_bp.route('/api/stop_session', methods=['POST'])
@login_required
def stop_session_api():
    data = request.json or {}
    session_key = data.get('key')
    if not session_key:
        return jsonify({'error': 'No session key'}), 400
    
    from app.modules.channels.services import ActiveSessionManager
    success = ActiveSessionManager.remove_session(session_key)
    return jsonify({'status': 'ok' if success else 'error'})

@channels_bp.route('/active')
@login_required
def active_sessions_page():
    return render_template('channels/active_sessions.html')

@channels_bp.route('/api/active_sessions')
@login_required
def get_active_sessions_api():
    from app.modules.channels.services import ActiveSessionManager
    from app.modules.channels.models import Channel
    
    sessions = ActiveSessionManager.get_active_sessions()
    server_stats = ActiveSessionManager.get_server_stats()
    
    results = []
    for s in sessions:
        ch = Channel.query.get(s['channel_id'])
        results.append({
            'key': s.get('key'),
            'channel_name': ch.name if ch else 'Unknown',
            'channel_id': s['channel_id'],
            'user': s['user'],
            'ip': s['ip'],
            'start_time': s['start_time'].strftime('%H:%M:%S'),
            'type': s['type'],
            'source': s.get('source', 'Unknown'),
            'bandwidth_kbps': s.get('bandwidth_kbps', 0),
            'duration': int((datetime.now() - s['start_time']).total_seconds())
        })
    
    return jsonify({
        'status': 'ok', 
        'sessions': results,
        'server_stats': server_stats
    })

@channels_bp.route('/api/proxy')
@channels_bp.route('/ts-proxy')
def proxy_stream():
    """
    TVHeadend-style Singleton Proxy Gateway.
    Secured by token to prevent Auth Redirect loops in media players.
    """
    token = request.args.get('token')
    username = validate_proxy_access(token)
    if not username:
        return "Unauthorized", 401
    
    url = request.args.get('url')
    channel_id = request.args.get('channel_id', type=int)
    
    if not url:
        return "No URL provided", 400
    
    if url.startswith('/'):
        url = f"{request.scheme}://{request.host}{url}"
    
    # 2. Singleton Proxy Logic (TVHeadend-style)
    # This ensures only ONE connection to the source IPTV server
    headers = {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
        'Connection': 'keep-alive',
    }
    
    # Background health check & Metadata refresh
    if channel_id:
        def _bg_check(app, cid):
            with app.app_context():
                from app.modules.health.services import HealthCheckService
                HealthCheckService.check_stream(cid)
        import threading
        threading.Thread(target=_bg_check, args=(current_app._get_current_object(), int(channel_id))).start()

    # Get the broadcast queue from the manager
    from app.modules.channels.services import StreamManager
    from app.modules.settings.services import SettingService
    if not SettingService.get('ENABLE_TS_PROXY', True):
        return "MPEG-TS Proxy is currently disabled.", 403
        
    global stream_manager
    q, sid = StreamManager.get_source_stream(url, headers=headers)
    
    def generate():
        start_time = time.time()
        bytes_total = 0
        bytes_since_last = 0
        try:
            last_ping = 0
            while True:
                try:
                    # Timeout ensures we don't hang if the source dies
                    try:
                        chunk = q.get(timeout=20) 
                    except queue.Empty:
                        continue # Source is slow, just keep waiting...
                        
                    if chunk is None: break
                    yield chunk
                    bytes_total += len(chunk)
                    bytes_since_last += len(chunk)
                    
                    # Heartbeat for Real-time Dashboard (every 3 seconds for better bandwidth resolution)
                    if channel_id and time.time() - last_ping > 3:
                        # Calculate real-time bandwidth
                        elapsed = time.time() - (last_ping or start_time)
                        if elapsed > 0:
                            # bits per second -> kbps
                            kbps = int((bytes_since_last * 8) / (elapsed * 1024))
                            ActiveSessionManager.update_session(
                                channel_id, username, request.remote_addr, 'Proxy (TS)', 
                                bandwidth_kbps=kbps,
                                user_agent=request.headers.get('User-Agent')
                            )
                        last_ping = time.time()
                        bytes_since_last = 0
                except Exception as e:
                    # Real error or disconnect
                    break
        finally:
            # Clean up: remove this client from the broadcast list
            StreamManager.remove_client(sid, q)
            
            # Record total stats when they finally disconnect
            if channel_id:
                duration = int(time.time() - start_time)
                ActiveSessionManager.update_session(channel_id, username, request.remote_addr, 'Proxy (TS)')
                
                if duration > 1: # Only track if they actually connected for a bit
                    # Use the already imported Channel and db
                    ch = Channel.query.get(channel_id)
                    if ch:
                        ch.total_watch_seconds += duration
                        # Estimate bandwidth
                        bitrate = 2.0 
                        if ch.resolution:
                            res = ch.resolution.lower()
                            if '3840' in res or '4k' in res: bitrate = 25.0
                            elif '1920' in res or '1080' in res: bitrate = 8.0
                            elif '1280' in res or '720' in res: bitrate = 4.0
                        
                        ch.total_bandwidth_mb += (bitrate * duration) / 8
                        db.session.commit()

    return Response(stream_with_context(generate()), content_type='video/mp2t')

@channels_bp.route('/api/proxy_merge')
def proxy_merge():
    """
    HQ Merger Proxy for YouTube/Web VOD.
    Uses ffmpeg to combine separate HQ Video and Audio streams into one TS stream.
    """
    v_url = request.args.get('v')
    a_url = request.args.get('a')
    channel_id = request.args.get('channel_id')
    token = request.args.get('token')
    
    username = validate_proxy_access(token)
    if not username:
        return "Unauthorized", 401

    if not v_url or not a_url:
        return "Missing streams", 400

    from app.modules.channels.services import ActiveSessionManager
    def generate():
        import subprocess
        # Command to merge V + A into MPEG-TS
        # We MUST re-encode audio to AAC to ensure compatibility in the MPEG-TS container.
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'error',
            '-i', v_url, '-i', a_url,
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
            '-map', '0:v:0', '-map', '1:a:0',
            '-f', 'mpegts', 'pipe:1'
        ]
        
        # Start Session
        if channel_id:
            ActiveSessionManager.update_session(int(channel_id), username, request.remote_addr, 'HQ Merger (4K/HD)')
        
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            while True:
                chunk = proc.stdout.read(256 * 1024) # 256KB chunks
                if not chunk: break
                yield chunk
        finally:
            try: proc.kill()
            except: pass
            
    return Response(stream_with_context(generate()), content_type='video/mp2t', headers={'Access-Control-Allow-Origin': '*'})

@channels_bp.route('/extractor')
def extractor_page():
    return render_template('channels/extractor.html')

@channels_bp.route('/extract_link', methods=['POST'])
def extract_link():
    from app.modules.channels.services import ExtractorService
    data = request.json or {}
    web_url = data.get('url')
    if not web_url:
        return jsonify({'success': False, 'error': 'No URL provided'})
    
    result = ExtractorService.extract_direct_url(web_url)
    return jsonify(result)


@channels_bp.route('/api/playlists_with_groups')
@login_required
def get_playlists_with_groups():
    from app.modules.playlists.models import PlaylistProfile
    playlists = PlaylistProfile.query.filter_by(is_system=False).all()
    
    result = []
    for pl in playlists:
        groups = [{"id": g.id, "name": g.name} for g in pl.groups]
        result.append({
            "id": pl.id,
            "name": pl.name,
            "groups": groups
        })
    return jsonify({"status": "ok", "playlists": result})

@channels_bp.route('/api/quick_add', methods=['POST'])
@login_required
def quick_add():
    data = request.get_json()
    channel_id = data.get('channel_id')
    playlist_id = data.get('playlist_id')
    group_id = data.get('group_id')
    
    if not channel_id or not playlist_id:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
    from app.modules.playlists.services import PlaylistService
    try:
        PlaylistService.add_channel_to_playlist(playlist_id, channel_id, group_id)
        return jsonify({"status": "ok", "message": "Added successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def rewrite_hls_manifest(content, base_url, channel_id, token):
    """Common helper to rewrite HLS manifest URLs to proxy URLs."""
    lines = content.splitlines()
    new_lines = []

    for line in lines:
        line = line.strip()
        if not line: continue

        if line.startswith('#'):
            # Handle Encryption Keys
            if 'URI=' in line:
                import re
                match = re.search(r'URI=["\']?(.*?)["\']?(?:,|$)', line)
                if match:
                    key_url = match.group(1)
                    if not key_url.startswith('http'):
                        if key_url.startswith('/'):
                            from urllib.parse import urlparse
                            p = urlparse(base_url) # base_url already contains host
                            key_url = f"{p.scheme}://{p.netloc}{key_url}"
                        else:
                            key_url = base_url + key_url

                    proxied_key = url_for('channels.proxy_hls_segment', channel_id=channel_id, url=key_url, token=token, _external=True)
                    line = line.replace(match.group(1), proxied_key)
            new_lines.append(line)
        else:
            # It's a segment or variant playlist
            seg_url = line
            if not seg_url.startswith('http'):
                if seg_url.startswith('/'):
                    from urllib.parse import urlparse
                    p = urlparse(base_url)
                    seg_url = f"{p.scheme}://{p.netloc}{seg_url}"
                else:
                    seg_url = base_url + seg_url

            new_lines.append(url_for('channels.proxy_hls_segment', channel_id=channel_id, url=seg_url, token=token, _external=True))

    return "\n".join(new_lines)

@channels_bp.route('/api/proxy_hls_manifest')
@channels_bp.route('/hls-proxy')
def proxy_hls_manifest():
    from app.modules.settings.services import SettingService
    if not SettingService.get('ENABLE_HLS_PROXY', True):
        return "HLS Proxy is currently disabled.", 403

    token = request.args.get('token')
    username = validate_proxy_access(token)
    if not username:
        return "Unauthorized", 401

    channel_id = request.args.get('channel_id')
    channel = Channel.query.get_or_404(channel_id)

    url = request.args.get('url') or channel.stream_url
    if not url:
        return "No URL provided", 400

    from app.modules.settings.services import SettingService
    ua = SettingService.get('CUSTOM_USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
    headers = { 'User-Agent': ua }

    # Background health check
    def _bg_check(app, cid):
        with app.app_context():
            from app.modules.health.services import HealthCheckService
            HealthCheckService.check_stream(cid)
    import threading
    threading.Thread(target=_bg_check, args=(current_app._get_current_object(), channel_id)).start()

    try:
        from app.modules.channels.services import ActiveSessionManager
        ActiveSessionManager.update_session(
            channel.id, username, request.remote_addr, 'Proxy (HLS)',
            bandwidth_kbps=2048,
            user_agent=request.headers.get('User-Agent')
        )

        resp = requests.get(url, headers=headers, timeout=10)
        pure_url = url.split('?')[0]
        base_url = pure_url.rsplit('/', 1)[0] + '/'

        rewritten = rewrite_hls_manifest(resp.text, base_url, channel_id, token)
        return Response(
            rewritten, 
            mimetype='application/vnd.apple.mpegurl',
            headers={'Access-Control-Allow-Origin': '*'}
        )
    except Exception as e:
        return str(e), 500

@channels_bp.route('/original/<int:channel_id>')
def direct_original_link(channel_id):
    """Bypasses everything and redirects to the source URL."""
    channel = Channel.query.get_or_404(channel_id)
    return redirect(channel.stream_url)

@channels_bp.route('/api/proxy_hls_segment')
def proxy_hls_segment():
    from app.modules.settings.services import SettingService
    if not SettingService.get('ENABLE_HLS_PROXY', True):
        return "HLS Proxy is currently disabled.", 403

    token = request.args.get('token')
    username = validate_proxy_access(token)
    if not username:
        return "Unauthorized", 401

    channel_id = request.args.get('channel_id')
    url = request.args.get('url')

    if not channel_id or not url:
        return "Missing params", 400

    from app.modules.settings.services import SettingService
    default_ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    ua = SettingService.get('CUSTOM_USER_AGENT', default_ua)
    headers = { 'User-Agent': ua }

    try:
        from app.modules.channels.services import ActiveSessionManager, HLSEngine
        from app.modules.channels.models import Channel
        ch = Channel.query.get(channel_id)
        bitrate = 2.0
        if ch and ch.resolution:
            res = ch.resolution.lower()
            if '3840' in res or '4k' in res: bitrate = 25.0
            elif '1920' in res or '1080' in res: bitrate = 8.0
            elif '1280' in res or '720' in res: bitrate = 4.0

        ActiveSessionManager.update_session(
            int(channel_id), username, request.remote_addr, 'Proxy (HLS)',
            bandwidth_kbps=int(bitrate * 1024),
            user_agent=request.headers.get('User-Agent')
        )

        # 1. Check if it's a Variant Playlist (m3u8)
        if '.m3u8' in url.lower() or 'playlist' in url.lower():
            resp = requests.get(url, headers=headers, timeout=10)
            pure_url = url.split('?')[0]
            base_url = pure_url.rsplit('/', 1)[0] + '/'

            rewritten = rewrite_hls_manifest(resp.text, base_url, channel_id, token)
            return Response(
                rewritten, 
                mimetype='application/vnd.apple.mpegurl',
                headers={'Access-Control-Allow-Origin': '*'}
            )

        # 2. It's a Media Segment (ts, m4s). Use Cache Engine.
        data = HLSEngine.get_segment(url, headers=headers)

        if data:
            if ch:
                ch.total_watch_seconds = (ch.total_watch_seconds or 0) + 8 
                db.session.commit()

            content_type = 'video/mp2t'
            if url.lower().endswith('.m4s'): content_type = 'video/iso.segment'
            if url.lower().endswith('.aac'): content_type = 'audio/aac'

            return Response(
                data, 
                content_type=content_type,
                headers={'Access-Control-Allow-Origin': '*'}
            )
        else:
            return redirect(url)

    except Exception as e:
        logger.error(f"HLS Proxy Error for {url}: {e}")
        return redirect(url)
