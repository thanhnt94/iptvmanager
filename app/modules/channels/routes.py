from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, current_app
from flask_login import login_required, current_user
import requests
from app.modules.channels.models import Channel, EPGSource
from app.modules.channels.services import ChannelService, EPGService
from app.core.database import db

channels_bp = Blueprint('channels', __name__, template_folder='templates')

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

    pagination = ChannelService.get_all_channels(
        page=page, 
        search=search, 
        group_filter=group,
        stream_type_filter=stream_type,
        status_filter=status,
        quality_filter=quality,
        res_filter=res_filter,
        audio_filter=audio,
        sort=sort
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
                           audio_filter=audio,
                           sort=sort,
                           distinct_groups=distinct_groups,
                           distinct_res=distinct_res,
                           distinct_audio=distinct_audio,
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
                
            PlaylistService.sync_channel_playlists(new_ch.id, playlist_data)
            
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

@channels_bp.route('/edit/<int:id>', methods=['GET', 'POST'])
@login_required
def edit_channel(id):
    from app.modules.playlists.models import PlaylistProfile, PlaylistEntry
    from app.modules.playlists.services import PlaylistService
    
    channel = Channel.query.get_or_404(id)
    
    if request.method == 'POST':
        ChannelService.update_channel(id, request.form)
        
        # Sync playlist memberships with group IDs
        selected_playlists = request.form.getlist('playlists')
        playlist_data = {}
        for pid in selected_playlists:
            group_id = request.form.get(f'group_{pid}')
            playlist_data[pid] = group_id
            
        PlaylistService.sync_channel_playlists(id, playlist_data)
        
        flash('Channel updated successfully!')
        return redirect(url_for('channels.index'))
    
    # For GET: fetch all available playlists (non-system) with their groups
    all_playlists = PlaylistProfile.query.filter_by(is_system=False).all()
    # Fetch current playlist memberships mapping pid -> group_id
    current_entries = PlaylistEntry.query.filter_by(channel_id=id).all()
    current_memberships = {e.playlist_id: e.group_id for e in current_entries}
    
    return render_template('channels/edit.html', 
                         channel=channel, 
                         all_playlists=all_playlists,
                         current_memberships=current_memberships)

@channels_bp.route('/delete/<int:id>', methods=['POST'])
@login_required
def delete_channel(id):
    channel = Channel.query.get_or_404(id)
    db.session.delete(channel)
    db.session.commit()
    flash('Channel deleted successfully.', 'success')
    return redirect(url_for('channels.index'))

@channels_bp.route('/web-player')
@login_required
def web_player():
    from app.modules.playlists.models import PlaylistProfile
    from app.modules.auth.services import AuthService
    
    if current_user.role == 'admin':
        playlists = PlaylistProfile.query.all()
    else:
        playlists = AuthService.get_user_playlists(current_user.id)
        
    initial_id = request.args.get('id', type=int)
    return render_template('channels/player.html', playlists=playlists, initial_id=initial_id)

@channels_bp.route('/api/channel/<int:id>')
@login_required
def get_channel_info(id):
    from app.modules.playlists.models import PlaylistEntry
    channel = Channel.query.get_or_404(id)
    
    # Try to find which playlist this channel belongs to
    entry = PlaylistEntry.query.filter_by(channel_id=id).first()
    playlist_id = entry.playlist_id if entry else None
    
    return jsonify({
        'status': 'ok',
        'channel': {
            'id': channel.id,
            'name': channel.name,
            'logo': channel.logo_url,
            'group': channel.group_name or 'Uncategorized',
            'play_url': url_for('channels.play_channel', id=channel.id),
            'stream_url': channel.stream_url,
            'playlist_id': playlist_id,
            'stream_type': channel.stream_type or 'live'
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
                'play_url': url_for('channels.play_channel', id=channel.id),
                'stream_url': channel.stream_url
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
                'play_url': url_for('channels.play_channel', id=channel.id),
                'stream_url': channel.stream_url
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

@channels_bp.route('/check/<int:id>', methods=['POST'])
def check_channel(id):
    from app.modules.health.services import HealthCheckService
    from datetime import datetime
    
    HealthCheckService.check_stream(id)
    channel = Channel.query.get(id)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('ajax'):
        return jsonify({
            'success': True,
            'status': channel.status,
            'stream_type': channel.stream_type,
            'quality': channel.quality,
            'resolution': channel.resolution,
            'audio_codec': channel.audio_codec,
            'latency': round(channel.latency, 1) if channel.latency else 0,
            'last_checked': channel.last_checked_at.strftime('%Y-%m-%d %H:%M') if channel.last_checked_at else 'Never'
        })
        
    flash('Channel check completed!')
    return redirect(url_for('channels.index'))

@channels_bp.route('/play_vlc/<int:id>', methods=['POST'])
def play_vlc(id):
    channel = Channel.query.get_or_404(id)
    # Use the wrapper URL instead of the direct stream URL
    wrapper_url = url_for('channels.play_channel', id=id, _external=True)
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
@channels_bp.route('/play/<int:id>')
def play_channel(id):
    """
    Playback redirector that obfuscates the original URL and 
    performs a quick health check on access (crowdsourced status).
    Now also triggers a background metadata refresh if live.
    """
    import threading
    from app.modules.health.services import HealthCheckService
    
    channel = Channel.query.get_or_404(id)
    
    # 1. Update Play Count
    channel.play_count += 1
    db.session.commit()
    
    # 2. Quick health check (Ping/HEAD only)
    try:
        response = requests.head(channel.stream_url, timeout=3, allow_redirects=True)
        if response.status_code >= 400:
            channel.status = 'die'
            # Clear metadata for dead links
            channel.quality = None
            channel.resolution = None
            channel.audio_codec = None
            channel.stream_type = 'unknown'
            db.session.commit()
        else:
            # Revive if needed
            if channel.status != 'live':
                channel.status = 'live'
                db.session.commit()
            
            # TRIGGER BACKGROUND METADATA REFRESH
            # This updates resolution, audio codec, etc. without blocking the user
            def _bg_check(app, cid):
                with app.app_context():
                    HealthCheckService.check_stream(cid)
            
            threading.Thread(target=_bg_check, args=(current_app._get_current_object(), id)).start()
            
    except Exception as e:
        logger.error(f"Quick check failed for {channel.name}: {e}")
        channel.status = 'die'
        db.session.commit()
        
    return redirect(channel.stream_url)

@channels_bp.route('/api/stats/<int:id>')
@login_required
def get_channel_stats(id):
    channel = Channel.query.get_or_404(id)
    
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
            'created_at': channel.created_at.strftime('%Y-%m-%d %H:%M')
        }
    })

@channels_bp.route('/api/track', methods=['POST'])
def track_usage():
    """
    Heartbeat API called by web player every 30s.
    Estimates bandwidth based on resolution.
    """
    data = request.json or {}
    channel_id = data.get('channel_id')
    seconds = data.get('seconds', 30) # default heartbeat interval
    
    if not channel_id:
        return jsonify({'error': 'No channel_id'}), 400
        
    channel = Channel.query.get(channel_id)
    if not channel:
        return jsonify({'error': 'Channel not found'}), 404
        
    # Estimated Bitrate in Mbps (conservative estimates)
    bitrate = 2.0 # default 2Mbps (SD)
    if channel.resolution:
        res = channel.resolution.lower()
        if '3840' in res or '4k' in res: bitrate = 25.0
        elif '1920' in res or '1080' in res: bitrate = 8.0
        elif '1280' in res or '720' in res: bitrate = 4.0
    
    # MB = (Mbps * seconds) / 8
    mb_used = (bitrate * seconds) / 8
    
    channel.total_watch_seconds += seconds
    channel.total_bandwidth_mb += mb_used
    db.session.commit()
    
    return jsonify({'status': 'ok'})


@channels_bp.route('/api/proxy')
@login_required
def proxy_stream():
    """
    Lightweight stream proxy to bypass CORS and fix fragile connections.
    """
    url = request.args.get('url')
    if not url:
        return "No URL provided", 400
    
    # Common headers to mimic a real player
    from urllib.parse import urlparse
    domain = urlparse(url).netloc
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Referer': f'http://{domain}/'
    }
    
    try:
        session = requests.Session()
        
        # Parse an incoming Range header from the browser
        client_range = request.headers.get('Range')
        start_byte = 0
        if client_range and client_range.startswith('bytes='):
            try:
                # Extract starting byte (e.g. 1000 from bytes=1000-)
                parts = client_range.split('=')[1].split('-')
                if parts[0]:
                    start_byte = int(parts[0])
            except (IndexError, ValueError):
                pass

        # Define the generator with an "Initial Burst Buffer" + "Resume" logic
        def generate():
            error_count = 0
            max_errors = 10
            bytes_sent = start_byte # Initialize with client's requested offset
            
            # Initial Buffer target (e.g., 512KB for VOD) to provide a "head start"
            # (Reducing to 512KB for faster seek response)
            INITIAL_BURST_SIZE = 1024 * 512 
            
            CHUNK_SIZE = 131072 # 128KB chunks
            
            while error_count < max_errors:
                try:
                    # Current local headers for this attempt
                    current_headers = headers.copy()
                    current_headers['Range'] = f'bytes={bytes_sent}-'
                        
                    # Mimic a persistent connection that reconnects if source ends
                    with session.get(url, headers=current_headers, stream=True, timeout=30, allow_redirects=True) as r:
                         # 416 = Range Not Satisfiable (already at end)
                        if r.status_code == 416:
                            return
                            
                        if r.status_code >= 400 and r.status_code != 206 and (r.status_code != 200 or bytes_sent == 0):
                            error_count += 1
                            import time
                            time.sleep(1)
                            continue

                        # Pipe chunks as they arrive
                        burst_buffer = b""
                        for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
                            if chunk:
                                error_count = 0 
                                bytes_sent += len(chunk)
                                
                                # Initial burst phase
                                if (bytes_sent - start_byte) < INITIAL_BURST_SIZE:
                                    burst_buffer += chunk
                                    continue
                                
                                if burst_buffer:
                                    yield burst_buffer
                                    burst_buffer = b""
                                    
                                yield chunk
                                
                        if burst_buffer:
                            yield burst_buffer
                        
                        import time
                        time.sleep(0.1)
                        continue 

                except (requests.exceptions.RequestException, Exception) as f:
                    error_count += 1
                    import time
                    time.sleep(0.5)
                    continue
            return
        
        # Determine mimetype from URL
        mimetype = 'video/mp2t'
        if '.m3u8' in url.lower():
            mimetype = 'application/vnd.apple.mpegurl'
        elif '.mp4' in url.lower():
            mimetype = 'video/mp4'
            
        status_code = 206 if client_range else 200
        response = current_app.response_class(generate(), status=status_code, mimetype=mimetype)
        response.headers['Accept-Ranges'] = 'bytes' # Enable seeking
        if client_range:
            response.headers['Content-Range'] = client_range # Pass-through basic info
            
        # Add basic CORS and caching headers
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response
        
    except Exception as e:
        return f"Proxy error: {str(e)}", 500

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
