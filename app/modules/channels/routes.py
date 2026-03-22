from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from app.modules.channels.models import Channel, EPGSource
from app.modules.channels.services import ChannelService, EPGService
from app.core.database import db

channels_bp = Blueprint('channels', __name__, template_folder='templates')

@channels_bp.route('/')
def index():
    page = request.args.get('page', 1, type=int)
    pagination = ChannelService.get_all_channels(page=page)
    return render_template('channels/index.html', pagination=pagination)

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

@channels_bp.route('/epg/sources')
def epg_sources():
    sources = EPGSource.query.all()
    return render_template('channels/epg_sources.html', sources=sources)

@channels_bp.route('/epg/sync/<int:id>', methods=['POST'])
def sync_epg(id):
    result = EPGService.sync_epg(id)
    return jsonify(result)
