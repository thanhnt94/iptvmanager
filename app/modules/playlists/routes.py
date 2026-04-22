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
    PlaylistService.ensure_user_default_playlists(current_user)
    
    query = PlaylistProfile.query
    if current_user.role == 'free':
        # Free users see their own playlists (including personalized system ones)
        query = query.filter_by(owner_id=current_user.id)
    else:
        # VIP/Admin see ALL playlists (their own, plus global system, etc.)
        # But let's prioritize showing only relevant ones: global system + their own + shared
        pass

    profiles = query.all()
    res = []
    for p in profiles:
        count = 0
        if p.is_system:
            query = Channel.query
            if p.slug == 'public':
                query = query.filter_by(is_public=True)
            elif p.owner_id:
                query = query.filter_by(owner_id=p.owner_id)
                if "protected" in p.slug:
                    query = query.filter_by(is_original=True)
            
            count = query.count()
        else:
            count = len(p.entries)
            
        res.append({
            'id': p.id,
            'name': p.name,
            'slug': p.slug,
            'security_token': p.security_token,
            'is_system': p.is_system,
            'channel_count': count,
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
        p = PlaylistProfile.query.get(playlist_id) if playlist_id > 0 else None
        slug = p.slug if p else 'alliptv'
        
        query = Channel.query
        if slug == 'protected':
            query = query.filter_by(is_original=True)
            
        # ISOLATION
        if slug in ['alliptv', 'protected']:
            if current_user.role != 'admin':
                query = query.filter_by(owner_id=current_user.id)
        elif slug == 'public':
            if current_user.role == 'free':
                # Access denied for free users on public system playlist
                groups = []
            else:
                query = query.filter_by(is_public=True)
        
        if 'groups' not in locals():
            groups = [g[0] for g in query.with_entities(Channel.group_name).distinct().filter(Channel.group_name != None).all()]
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
        p = PlaylistProfile.query.get(playlist_id) if playlist_id > 0 else None
        
        query = Channel.query
        
        if not p: # system_all fallback
            query = query.filter_by(owner_id=current_user.id)
        elif p.owner_id:
            query = query.filter_by(owner_id=p.owner_id)
            if "protected" in p.slug:
                query = query.filter_by(is_original=True)
        elif p.slug == 'public':
            if current_user.role == 'free':
                abort(403)
            query = query.filter_by(is_public=True)
    else:
        # Check accessibility for non-system playlists
        p = PlaylistProfile.query.get_or_404(playlist_id)
        if current_user.role == 'free' and p.owner_id != current_user.id:
            abort(403)
            
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
        # Check if token is user's api_token (for semantic compatibility)
        from app.modules.auth.models import User
        u = User.query.filter_by(api_token=token).first()
        if not u or (profile.owner_id and profile.owner_id != u.id and u.role != 'admin'):
            abort(403)
        
    xml_url = url_for('playlists.publish_xml', slug=slug, token=token, _external=True)
    m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
    response = Response(m3u_content, mimetype='application/x-mpegurl')
    response.headers["Content-Disposition"] = f'inline; filename="{slug}.m3u8"'
    return response

@playlists_bp.route('/publish/user/<username>/<ptype>.<ext>')
def publish_user_special(username, ptype, ext):
    from app.modules.auth.models import User
    user = User.query.filter_by(username=username).first_or_404()
    token = request.args.get('token')
    
    # RBAC: viewer must be owner or admin
    viewer = User.query.filter_by(api_token=token).first()
    if not viewer or (viewer.id != user.id and viewer.role != 'admin'):
        abort(403)
        
    slug = f"user-{user.id}-{ptype}"
    profile = PlaylistProfile.query.filter_by(slug=slug).first_or_404()
    
    if ext == 'xml':
        return Response(PlaylistService.generate_xmltv(profile.id), mimetype='text/xml')
    else:
        hide_die = request.args.get('hide_die', 'false').lower() == 'true'
        mode = request.args.get('mode')
        xml_url = url_for('playlists.publish_user_special', username=username, ptype=ptype, ext='xml', token=token, _external=True)
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
        return Response(m3u_content, mimetype='application/x-mpegurl')

@playlists_bp.route('/publish/common/public.<ext>')
def publish_common_public(ext):
    token = request.args.get('token')
    from app.modules.auth.models import User
    viewer = User.query.filter_by(api_token=token).first()
    if not viewer or viewer.role == 'free':
        abort(403)
        
    profile = PlaylistProfile.query.filter_by(slug='public').first_or_404()
    
    if ext == 'xml':
        return Response(PlaylistService.generate_xmltv(profile.id), mimetype='text/xml')
    else:
        hide_die = request.args.get('hide_die', 'false').lower() == 'true'
        mode = request.args.get('mode')
        xml_url = url_for('playlists.publish_common_public', ext='xml', token=token, _external=True)
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
        return Response(m3u_content, mimetype='application/x-mpegurl')

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
    
    from app.modules.auth.models import User
    viewer = User.query.filter_by(api_token=token).first() if token else None

    # Access Control
    if profile.is_system:
        if profile.slug == 'public' and (not viewer or viewer.role == 'free'):
            abort(403)
        if profile.owner_id and (not viewer or (viewer.id != profile.owner_id and viewer.role != 'admin')):
            abort(403)
    elif profile.security_token and token != profile.security_token:
        abort(403)

    return Response(PlaylistService.generate_xmltv(profile.id), mimetype='text/xml')
