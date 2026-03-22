from flask import Blueprint, render_template, request, redirect, url_for, Response, abort, jsonify, flash
from flask_login import login_required
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
from app.modules.playlists.services import PlaylistService
from app.modules.channels.services import ChannelService
from app.modules.channels.models import Channel
from app.core.database import db

playlists_bp = Blueprint('playlists', __name__, template_folder='templates')

@playlists_bp.route('/')
@login_required
def index():
    profiles = PlaylistProfile.query.all()
    return render_template('playlists/index.html', profiles=profiles)

@playlists_bp.route('/create', methods=['POST'])
def create_profile():
    name = request.form.get('name')
    slug = request.form.get('slug')
    PlaylistService.create_profile(name, slug)
    return redirect(url_for('playlists.index'))

@playlists_bp.route('/delete/<int:id>', methods=['POST'])
def delete_profile(id):
    profile = PlaylistProfile.query.get_or_404(id)
    if profile.is_system:
        flash('Cannot delete a system-required playlist!')
        return redirect(url_for('playlists.index'))
        
    db.session.delete(profile)
    db.session.commit()
    flash('Playlist deleted!')
    return redirect(url_for('playlists.index'))

@playlists_bp.route('/view/<int:id>')
@login_required
def view_playlist(id):
    profile = PlaylistProfile.query.get_or_404(id)
    
    is_system_playlist = profile.is_system # Flag for system playlists

    page = request.args.get('page', 1, type=int)
    search = request.args.get('search')
    group = request.args.get('group')
    stream_type = request.args.get('stream_type')
    
    pagination = ChannelService.get_all_channels(page=page, per_page=100, search=search, group_filter=group, stream_type_filter=stream_type)
    distinct_groups = ChannelService.get_distinct_groups()

    # Generate external shareable links
    share_url = url_for('playlists.publish_m3u8', slug=profile.slug, _external=True)
    epg_url = url_for('playlists.publish_xml', slug=profile.slug, _external=True)
    
    if profile.security_token:
        share_url += f"?token={profile.security_token}"
        epg_url += f"?token={profile.security_token}"
    
    return render_template('playlists/view.html', 
                           profile=profile, 
                           all_channels=pagination.items,
                           pagination=pagination,
                           distinct_groups=distinct_groups,
                           search=search,
                           group=group,
                           stream_type=stream_type,
                           share_url=share_url,
                           epg_url=epg_url)

@playlists_bp.route('/add-channel/<int:playlist_id>/<int:channel_id>', methods=['POST'])
@login_required
def add_channel(playlist_id, channel_id):
    # No longer taking group_id from form here as per user request
    PlaylistService.add_channel_to_playlist(playlist_id, channel_id)
    return redirect(url_for('playlists.view_playlist', id=playlist_id))

@playlists_bp.route('/update-entry-group/<int:entry_id>', methods=['POST'])
def update_entry_group(entry_id):
    data = request.json or {}
    group_id = data.get('group_id')
    if group_id == "": group_id = None
    PlaylistService.update_entry_group(entry_id, group_id)
    return jsonify({'status': 'ok'})

@playlists_bp.route('/create-group/<int:playlist_id>', methods=['POST'])
@login_required
def create_group(playlist_id):
    name = request.form.get('name')
    if name:
        PlaylistService.create_group(playlist_id, name)
    return redirect(url_for('playlists.view_playlist', id=playlist_id))

@playlists_bp.route('/group/rename/<int:group_id>', methods=['POST'])
@login_required
def rename_group(group_id):
    data = request.json or {}
    new_name = data.get('new_name')
    if not new_name:
        return jsonify({'status': 'error', 'message': 'New name is required'}), 400
    
    if PlaylistService.rename_group(group_id, new_name):
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'error', 'message': 'Group not found'}), 404

@playlists_bp.route('/reorder/<int:playlist_id>', methods=['POST'])
@login_required
def reorder(playlist_id):
    entry_ids = request.json.get('entry_ids', [])
    PlaylistService.reorder_entries(playlist_id, entry_ids)
    return jsonify({'status': 'ok'})

# Dynamic Endpoint
@playlists_bp.route('/publish/<slug>.m3u8')
def publish_m3u8(slug):
    token = request.args.get('token')
    profile = PlaylistProfile.query.filter_by(slug=slug).first_or_404()
    
    # Token Security
    if profile.security_token and token != profile.security_token:
        abort(403, description="Invalid security token")
        
    # IP Security (Optional - placeholder logic)
    if profile.allowed_ips:
        client_ip = request.remote_addr
        if client_ip not in profile.allowed_ips:
            abort(403, description="IP address not allowed")

    m3u_url = url_for('playlists.publish_m3u8', slug=slug, token=token, _external=True)
    xml_url = url_for('playlists.publish_xml', slug=slug, token=token, _external=True)
    
    m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url)
    return Response(m3u_content, mimetype='text/plain')

@playlists_bp.route('/publish/<slug>.xml')
def publish_xml(slug):
    token = request.args.get('token')
    profile = PlaylistProfile.query.filter_by(slug=slug).first_or_404()
    
    if profile.security_token and token != profile.security_token:
        abort(403, description="Invalid security token")
        
    if profile.allowed_ips:
        client_ip = request.remote_addr
        if client_ip not in profile.allowed_ips:
            abort(403, description="IP address not allowed")

    xml_content = PlaylistService.generate_xmltv(profile.id)
    return Response(xml_content, mimetype='text/xml')
