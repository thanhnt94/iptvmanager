from flask import Blueprint, render_template, request, redirect, url_for, Response, abort, jsonify, flash, current_app
from flask_login import login_required, current_user
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
from app.modules.playlists.services import PlaylistService
from app.modules.channels.services import ChannelService
from app.modules.channels.models import Channel
from app.core.database import db

playlists_bp = Blueprint('playlists', __name__)

# API & Manifest Core Only - HTML Routes Purged

@playlists_bp.route('/', methods=['GET'])
@login_required
def list_playlists():
    profiles = PlaylistProfile.query.all()
    res = []
    for p in profiles:
        res.append({
            'id': p.id,
            'name': p.name,
            'slug': p.slug,
            'security_token': p.security_token,
            'is_system': p.is_system,
            'channel_count': Channel.query.count() if p.is_system else len(p.entries),
            'created_at': p.created_at.strftime('%Y-%m-%d')
        })
    return jsonify(res)

@playlists_bp.route('/groups/<int:playlist_id>', methods=['GET'])
@login_required
def get_groups(playlist_id):
    """Returns a list of unique group names (categories) for a specific playlist."""
    is_system_playlist = False
    if playlist_id > 0:
        p = PlaylistProfile.query.get(playlist_id)
        if p and p.is_system:
            is_system_playlist = True

    if playlist_id == 0 or is_system_playlist:
        # System-wide groups
        groups = [g[0] for g in db.session.query(Channel.group_name).distinct().filter(Channel.group_name != None).all()]
    else:
        # Playlist-specific groups
        groups = [g[0] for g in db.session.query(Channel.group_name).join(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id).distinct().filter(Channel.group_name != None).all()]
    
    return jsonify({'categories': sorted(groups)})

@playlists_bp.route('/entries/<int:playlist_id>', methods=['GET'])
@login_required
def get_entries(playlist_id):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 100, type=int)
    search = request.args.get('q', '')
    group = request.args.get('group', '')
    hide_die = request.args.get('hide_die', 'false').lower() == 'true'

    is_system_playlist = False
    if playlist_id > 0:
        p = PlaylistProfile.query.get(playlist_id)
        if p and p.is_system:
            is_system_playlist = True

    if playlist_id == 0 or str(playlist_id) == 'system_all' or is_system_playlist:
        query = Channel.query
    else:
        query = Channel.query.join(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id)

    if hide_die:
        # User requested to exclude offline/die channels
        query = query.filter(Channel.status != 'die')

    if search:
        query = query.filter(Channel.name.ilike(f'%{search}%'))
    if group:
        query = query.filter(Channel.group_name == group)

    pagination = query.order_by(Channel.name).paginate(page=page, per_page=per_page)
    
    # Safety check for token
    try:
        token = current_user.api_token
    except Exception:
        token = 'guest_token'
        
    channels = []
    for ch in pagination.items:
        try:
            # Check if this is an FLV stream
            is_flv = ch.stream_url and '.flv' in ch.stream_url.lower().split('?')[0]
            
            # Default smart link logic: Use tracking for FLV, else standard play
            smart_url = url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True) if is_flv \
                        else url_for('channels.play_channel', channel_id=ch.id, token=token, _external=True)
            
            ch_data = {
                'id': ch.id,
                'name': ch.name,
                'logo_url': ch.logo_url,
                'group': ch.group_name,
                'status': ch.status,
                'quality': ch.quality,
                'resolution': ch.resolution,
                'stream_format': ch.stream_format,
                'play_url': smart_url,
                'play_links': {
                    'smart': smart_url,
                    'original': ch.stream_url,
                    'tracking': url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True),
                    'hls': url_for('channels.play_hls', channel_id=ch.id, token=token, _external=True),
                    'ts': url_for('channels.play_ts', channel_id=ch.id, token=token, _external=True)
                }
            }
            channels.append(ch_data)
        except Exception as e:
            # Skip invalid entries instead of crashing the whole list
            current_app.logger.error(f"Error processing channel {ch.id}: {str(e)}")
            continue

    return jsonify({
        'channels': channels,
        'has_more': pagination.has_next
    })

@playlists_bp.route('/reorder/<int:playlist_id>', methods=['POST'])
@login_required
def reorder(playlist_id):
    entry_ids = request.json.get('entry_ids', [])
    PlaylistService.reorder_entries(playlist_id, entry_ids)
    return jsonify({'status': 'ok'})

@playlists_bp.route('/update-entry-group/<int:entry_id>', methods=['POST'])
@login_required
def update_entry_group(entry_id):
    data = request.json or {}
    group_id = data.get('group_id')
    if group_id == "": group_id = None
    PlaylistService.update_entry_group(entry_id, group_id)
    return jsonify({'status': 'ok'})

# Dynamic Manifest Endpoints
@playlists_bp.route('/publish/<slug>.m3u8')
def publish_m3u8(slug):
    token = request.args.get('token')
    hide_die = request.args.get('hide_die', 'false').lower() == 'true'
    mode = request.args.get('mode') # Force link mode (smart, direct, tracking)
    profile = PlaylistProfile.query.filter_by(slug=slug).first_or_404()
    
    if profile.security_token and token != profile.security_token:
        abort(403)
        
    xml_url = url_for('playlists.publish_xml', slug=slug, token=token, _external=True)
    m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
    response = Response(m3u_content, mimetype='application/x-mpegurl')
    response.headers["Content-Disposition"] = f'inline; filename="{slug}.m3u8"'
    return response

@playlists_bp.route('/<int:playlist_id>', methods=['DELETE'])
@login_required
def delete_playlist(playlist_id):
    success, message = PlaylistService.delete_profile(playlist_id)
    if success:
        return jsonify({'status': 'ok', 'message': message})
    return jsonify({'status': 'error', 'message': message}), 400

@playlists_bp.route('/publish/<slug>.xml')
def publish_xml(slug):
    profile = PlaylistProfile.query.filter_by(slug=slug).first_or_404()
    token = request.args.get('token')
    
    if token:
        from app.modules.auth.models import User, UserPlaylist
        user = User.query.filter_by(api_token=token).first()
        if user:
            if user.role == 'admin':
                return Response(PlaylistService.generate_xml(profile.id), mimetype='text/xml')
            access = UserPlaylist.query.filter_by(user_id=user.id, playlist_id=profile.id).first()
            if access:
                return Response(PlaylistService.generate_xml(profile.id), mimetype='text/xml')
    
    abort(403)
