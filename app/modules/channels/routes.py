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
    
    pagination = ChannelService.get_all_channels(
        page=page, 
        search=search, 
        group_filter=group,
        stream_type_filter=stream_type
    )
    
    # Calculate stats (filtered by search/group if applied, or keep global?)
    # User said "có bao nhiêu kênh", usually global is better for the header, 
    # but let's keep it global for now.
    stats = {
        'total': Channel.query.count(),
        'live': Channel.query.filter_by(status='live').count(),
        'die': Channel.query.filter_by(status='die').count(),
        'unknown': Channel.query.filter((Channel.status == None) | (Channel.status == 'unknown')).count()
    }
    
    distinct_groups = ChannelService.get_distinct_groups()
    
    return render_template('channels/index.html', 
                           channels=pagination.items, 
                           pagination=pagination, 
                           stats=stats, 
                           distinct_groups=distinct_groups,
                           search=search,
                           group=group,
                           stream_type=stream_type)

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
            'latency': round(channel.latency, 1) if channel.latency else 0,
            'last_checked': channel.last_checked_at.strftime('%Y-%m-%d %H:%M') if channel.last_checked_at else 'Never'
        })
        
    flash('Channel check completed!')
    return redirect(url_for('channels.index'))

@channels_bp.route('/epg/sources')
def epg_sources():
    sources = EPGSource.query.all()
    return render_template('channels/epg_sources.html', sources=sources)

@channels_bp.route('/epg/sync/<int:id>', methods=['POST'])
def sync_epg(id):
    result = EPGService.sync_epg(id)
    return jsonify(result)
