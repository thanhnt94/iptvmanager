from flask import Blueprint, render_template, request, redirect, url_for, Response, abort, jsonify, flash, current_app
from flask_login import login_required, current_user
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
from app.modules.playlists.services import PlaylistService
from app.modules.channels.services import ChannelService
from app.modules.channels.models import Channel
from app.core.database import db

playlists_bp = Blueprint('playlists', __name__)
publish_bp = Blueprint('publish', __name__)

# API & Manifest Core Only - HTML Routes Purged

@playlists_bp.route('/', methods=['POST'])
@login_required
def create_playlist():
    data = request.json or {}
    name = data.get('name')
    slug = data.get('slug')
    
    if not name or not slug:
        return jsonify({'status': 'error', 'message': 'Name and Slug are required'}), 400
        
    # Check if slug exists FOR THIS USER
    if PlaylistProfile.query.filter_by(slug=slug, owner_id=current_user.id).first():
        return jsonify({'status': 'error', 'message': 'Slug already exists for your account'}), 400
        
    profile = PlaylistService.create_profile(name, slug)
    profile.owner_id = current_user.id
    db.session.commit()
    
    return jsonify({
        'status': 'ok', 
        'playlist': {
            'id': profile.id,
            'name': profile.name,
            'slug': profile.slug,
            'security_token': profile.security_token,
            'created_at': profile.created_at.strftime('%Y-%m-%d')
        }
    })

@playlists_bp.route('/<int:playlist_id>', methods=['PATCH'])
@login_required
def update_playlist_profile(playlist_id):
    data = request.json or {}
    name = data.get('name')
    slug = data.get('slug')
    
    success, result = PlaylistService.update_profile(playlist_id, name, slug)
    if not success:
        return jsonify({'status': 'error', 'message': result}), 400
        
    return jsonify({
        'status': 'ok',
        'playlist': {
            'id': result.id,
            'name': result.name,
            'slug': result.slug
        }
    })

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
    from app.modules.auth.models import User
    for p in profiles:
        owner = User.query.get(p.owner_id) if p.owner_id else None
        owner_name = owner.username if owner else 'system'
        
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
            
        owner = User.query.get(p.owner_id) if p.owner_id else None
        owner_name = owner.username if owner else 'system'
        
        # Calculate live/die stats
        live_count = 0
        die_count = 0
        if p.is_system:
            stat_query = Channel.query
            if p.slug == 'public': stat_query = stat_query.filter_by(is_public=True)
            elif p.owner_id:
                stat_query = stat_query.filter_by(owner_id=p.owner_id)
                if "protected" in p.slug: stat_query = stat_query.filter_by(is_original=True)
            live_count = stat_query.filter_by(status='live').count()
            die_count = stat_query.filter_by(status='die').count()
        else:
            for entry in p.entries:
                if entry.channel:
                    if entry.channel.status == 'live': live_count += 1
                    elif entry.channel.status == 'die': die_count += 1
        
        res.append({
            'id': p.id,
            'name': p.name,
            'slug': p.slug,
            'security_token': p.security_token,
            'is_system': p.is_system,
            'channel_count': count,
            'live_count': live_count,
            'die_count': die_count,
            'created_at': p.created_at.strftime('%Y-%m-%d'),
            'owner_username': owner_name
        })
    return jsonify(res)

@playlists_bp.route('/groups/<int:playlist_id>', methods=['GET'])
@login_required
def get_groups(playlist_id):
    """Returns a list of groups for a specific playlist with IDs."""
    is_system = False
    p = None
    if playlist_id > 0:
        p = PlaylistProfile.query.get_or_404(playlist_id)
        if p.is_system: is_system = True
    elif playlist_id == 0 or str(playlist_id) == 'system_all':
        is_system = True

    if is_system:
        # For system playlists, groups come from unique channel group names
        query = Channel.query
        if not p: # system_all
            query = query.filter_by(owner_id=current_user.id)
        elif p.owner_id:
            query = query.filter_by(owner_id=p.owner_id)
            if "protected" in p.slug: query = query.filter_by(is_original=True)
        elif p.slug == 'public':
            query = query.filter_by(is_public=True)
            
        group_names = db.session.query(Channel.group_name).filter(query.whereclause).distinct().all()
        groups = [{'id': i+1, 'name': g[0] or 'Ungrouped'} for i, g in enumerate(group_names)]
    else:
        # For custom playlists, use the PlaylistGroup table
        groups = [{'id': g.id, 'name': g.name} for g in p.groups]
        
    return jsonify({'groups': groups})

@playlists_bp.route('/groups', methods=['POST'])
@login_required
def create_playlist_group():
    data = request.json or {}
    playlist_id = data.get('playlist_id')
    name = data.get('name')
    
    if not playlist_id or not name:
        return jsonify({'status': 'error', 'message': 'Playlist ID and name required'}), 400
        
    p = PlaylistProfile.query.get_or_404(playlist_id)
    if current_user.role == 'free' and p.owner_id != current_user.id:
        abort(403)
        
    group = PlaylistService.create_group(playlist_id, name)
    return jsonify({'status': 'ok', 'group_id': group.id})

@playlists_bp.route('/batch-add', methods=['POST'])
@login_required
def batch_add_to_playlist():
    data = request.json or {}
    playlist_id = data.get('playlist_id')
    channel_ids = data.get('channel_ids', [])
    group_id = data.get('group_id')
    
    if not playlist_id or not channel_ids:
        return jsonify({'status': 'error', 'message': 'Missing data'}), 400
        
    count = PlaylistService.batch_add_channels_to_playlist(playlist_id, channel_ids, group_id)
    return jsonify({'status': 'ok', 'added_count': count})

@playlists_bp.route('/entries/<int:entry_id>', methods=['DELETE'])
@login_required
def delete_entry(entry_id):
    entry = PlaylistEntry.query.get_or_404(entry_id)
    # RBAC
    if current_user.role == 'free' and entry.playlist.owner_id != current_user.id:
        abort(403)
        
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'status': 'ok'})

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
        p = PlaylistProfile.query.get(playlist_id) if (playlist_id > 0 and playlist_id != 'system_all') else None
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
            
        if hide_die: query = query.filter(Channel.status != 'die')
        if search: query = query.filter(Channel.name.ilike(f'%{search}%'))
        if group: query = query.filter(Channel.group_name == group)
        
        pagination = query.order_by(Channel.name.asc()).paginate(page=page, per_page=per_page)
        items = [(ch, None) for ch in pagination.items]
    else:
        # Check accessibility for non-system playlists
        p = PlaylistProfile.query.get_or_404(playlist_id)
        if current_user.role == 'free' and p.owner_id != current_user.id:
            abort(403)
            
        query = db.session.query(Channel, PlaylistEntry).join(PlaylistEntry, PlaylistEntry.channel_id == Channel.id)
        query = query.filter(PlaylistEntry.playlist_id == playlist_id)

        if hide_die: query = query.filter(Channel.status != 'die')
        if search: query = query.filter(Channel.name.ilike(f'%{search}%'))
        if group: query = query.filter(Channel.group_name == group)

        pagination = query.order_by(PlaylistEntry.order_index.asc()).paginate(page=page, per_page=per_page)
        items = pagination.items
    
    # Safety check for token
    try:
        from app.modules.auth.models import User
        token = current_user.api_token
    except Exception:
        token = 'guest_token'
        
    channels = []
    for ch, entry in items:
        try:
            # Check if this is an FLV stream
            is_flv = ch.stream_url and '.flv' in ch.stream_url.lower().split('?')[0]
            smart_url = url_for('channels.track_redirect', channel_id=ch.id, token=token, _external=True) if is_flv \
                        else url_for('channels.play_channel', channel_id=ch.id, token=token, _external=True)
            
            # Group name logic: Playlist-specific group name or channel default
            display_group = ch.group_name
            entry_id = ch.id
            if entry:
                display_group = entry.group.name if entry.group else entry.custom_group or ch.group_name
                entry_id = entry.id
            
            ch_data = {
                'id': entry_id,
                'channel_id': ch.id,
                'name': ch.name,
                'logo_url': ch.logo_url,
                'group': display_group,
                'status': ch.status,
                'epg_id': ch.epg_id,
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
            current_app.logger.error(f"Error processing item: {str(e)}")
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
    if group_id == "" or group_id == 0: group_id = None
    PlaylistService.update_entry_group(entry_id, group_id)
    return jsonify({'status': 'ok'})

# Dynamic Manifest Endpoints (Friendly URLs - NO /api PREFIX)
@publish_bp.route('/p/<username>/<slug>', defaults={'mode': 'smart', 'status': 'live'})
@publish_bp.route('/p/<username>/<slug>/<mode>', defaults={'status': 'live'})
@publish_bp.route('/p/<username>/<slug>/<mode>/<status>')
def publish_friendly(username, slug, mode, status):
    from app.modules.auth.models import User
    user = User.query.filter_by(username=username).first_or_404()
    profile = PlaylistProfile.query.filter_by(slug=slug, owner_id=user.id).first_or_404()
    
    # Parameters from path
    hide_die = (status == 'live')
    # mode is already 'mode'
    
    # Token is now optional (username + secret slug acts as the key)
    token = request.args.get('token') or profile.security_token
    
    xml_url = url_for('publish.publish_personalized', username=username, slug=slug, ext='xml', token=token, _external=True)
    m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
    response = Response(m3u_content, mimetype='application/x-mpegurl')
    response.headers["Content-Disposition"] = f'inline; filename="{slug}.m3u8"'
    return response

@publish_bp.route('/publish/<username>/<slug>.<ext>')
def publish_personalized(username, slug, ext):
    from app.modules.auth.models import User
    user = User.query.filter_by(username=username).first_or_404()
    profile = PlaylistProfile.query.filter_by(slug=slug, owner_id=user.id).first_or_404()
    
    token = request.args.get('token')
    hide_die = request.args.get('hide_die', 'false').lower() == 'true'
    mode = request.args.get('mode')
    
    if profile.security_token and token != profile.security_token:
        # Check if token is user's api_token
        u = User.query.filter_by(api_token=token).first()
        if not u or (profile.owner_id and profile.owner_id != u.id and u.role != 'admin'):
            abort(403)
            
    if ext == 'xml':
        return Response(PlaylistService.generate_xmltv(profile.id), mimetype='text/xml')
    else:
        xml_url = url_for('publish.publish_personalized', username=username, slug=slug, ext='xml', token=token, _external=True)
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
        response = Response(m3u_content, mimetype='application/x-mpegurl')
        response.headers["Content-Disposition"] = f'inline; filename="{slug}.m3u8"'
        return response

@publish_bp.route('/publish/<slug>.m3u8')
def publish_m3u8_legacy(slug):
    # Keep legacy for some time or redirect
    profile = PlaylistProfile.query.filter_by(slug=slug).first_or_404()
    from app.modules.auth.models import User
    owner = User.query.get(profile.owner_id) if profile.owner_id else None
    username = owner.username if owner else 'system'
    return redirect(url_for('publish.publish_personalized', username=username, slug=slug, ext='m3u8', **request.args))

@publish_bp.route('/publish/user/<username>/<ptype>.<ext>')
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
        xml_url = url_for('publish.publish_user_special', username=username, ptype=ptype, ext='xml', token=token, _external=True)
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
        return Response(m3u_content, mimetype='application/x-mpegurl')

@publish_bp.route('/publish/common/public.<ext>')
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
        xml_url = url_for('publish.publish_common_public', ext='xml', token=token, _external=True)
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, token=token, hide_die=hide_die, mode=mode)
        return Response(m3u_content, mimetype='application/x-mpegurl')

@publish_bp.route('/publish/<slug>.xml')
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

@playlists_bp.route('/<int:playlist_id>', methods=['DELETE'])
@login_required
def delete_playlist(playlist_id):
    success, message = PlaylistService.delete_profile(playlist_id)
    if success:
        return jsonify({'status': 'ok', 'message': message})
    return jsonify({'status': 'error', 'message': message}), 400

@playlists_bp.route('/<int:playlist_id>/quick-check', methods=['POST'])
@login_required
def quick_check_playlist(playlist_id):
    profile = PlaylistProfile.query.get_or_404(playlist_id)
    
    # Always use background scan for stability and to avoid Gunicorn TLE
    from app.modules.health.services import HealthCheckService
    HealthCheckService.start_background_scan(
        current_app._get_current_object(),
        mode='all',
        playlist_id=playlist_id,
        delay=5
    )
    
    return jsonify({
        'status': 'background',
        'message': f'Signal check for "{profile.name}" initiated in background.',
        'playlist_id': playlist_id
    })

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
