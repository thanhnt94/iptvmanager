from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from app.modules.channels.models import Channel, EPGSource
from app.modules.channels.services import ChannelService, EPGService
from app.core.database import db

channels_bp = Blueprint('channels', __name__, template_folder='templates')

@channels_bp.route('/')
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
    
    return render_template('channels/index.html', 
                           channels=pagination.items, 
                           pagination=pagination, 
                           stats=stats, 
                           distinct_groups=distinct_groups,
                           distinct_res=distinct_res,
                           distinct_audio=distinct_audio,
                           search=search,
                           group=group,
                           stream_type=stream_type,
                           status=status,
                           quality=quality,
                           res_filter=resolution,
                           audio_filter=audio)

@channels_bp.route('/add', methods=['GET', 'POST'])
def add_channel():
    if request.method == 'POST':
        name = request.form.get('name')
        stream_url = request.form.get('stream_url')
        logo_url = request.form.get('logo_url')
        epg_id = request.form.get('epg_id')
        group_name = request.form.get('group_name', 'Manual')
        
        # Check for duplication
        existing = Channel.query.filter_by(stream_url=stream_url).first()
        if existing:
            flash(f'Error: This stream URL already exists in channel "{existing.name}" (ID: {existing.id})', 'danger')
            return render_template('channels/add.html', 
                                   form_data=request.form,
                                   distinct_groups=ChannelService.get_distinct_groups())

        new_channel = Channel(
            name=name,
            stream_url=stream_url,
            logo_url=logo_url,
            epg_id=epg_id,
            group_name=group_name,
            status='unknown',
            stream_type='unknown'
        )
        db.session.add(new_channel)
        db.session.commit()
        
        # Optionally trigger immediate check
        from app.modules.health.services import HealthCheckService
        HealthCheckService.check_stream(new_channel.id)
        
        flash('Channel added successfully!', 'success')
        return redirect(url_for('channels.index'))
        
    return render_template('channels/add.html', 
                           distinct_groups=ChannelService.get_distinct_groups())

@channels_bp.route('/edit/<int:id>', methods=['GET', 'POST'])
def edit_channel(id):
    channel = Channel.query.get_or_404(id)
    if request.method == 'POST':
        ChannelService.update_channel(id, request.form)
        flash('Channel updated successfully!')
        return redirect(url_for('channels.index'))
    return render_template('channels/edit.html', channel=channel)

@channels_bp.route('/delete/<int:id>', methods=['POST'])
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
    success = ChannelService.play_with_vlc(channel.stream_url)
    return jsonify({'success': success})

@channels_bp.route('/epg/sources')
def epg_sources():
    sources = EPGSource.query.all()
    return render_template('channels/epg_sources.html', sources=sources)

@channels_bp.route('/epg/sync/<int:id>', methods=['POST'])
def sync_epg(id):
    result = EPGService.sync_epg(id)
    return jsonify(result)
