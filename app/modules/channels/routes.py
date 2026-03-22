from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, current_app
from flask_login import login_required
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
    resolution = request.args.get('resolution', '')
    audio = request.args.get('audio', '')
    
    pagination = ChannelService.get_all_channels(
        page=page, 
        search=search, 
        group_filter=group,
        stream_type_filter=stream_type,
        status_filter=status,
        quality_filter=quality,
        res_filter=resolution,
        audio_filter=audio
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
                           res_filter=resolution,
                           audio_filter=audio,
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
    flash('Channel deleted!')
    return redirect(url_for('channels.index'))

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
    
    # Quick health check (Ping/HEAD only)
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
            
    except:
        channel.status = 'die'
        db.session.commit()
        
    return redirect(channel.stream_url)

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

