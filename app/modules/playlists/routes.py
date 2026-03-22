from flask import Blueprint, render_template, request, redirect, url_for, Response, abort, jsonify
from app.modules.playlists.models import PlaylistProfile, PlaylistEntry
from app.modules.playlists.services import PlaylistService
from app.modules.channels.models import Channel
from app.core.database import db

playlists_bp = Blueprint('playlists', __name__, template_folder='templates')

@playlists_bp.route('/')
def index():
    profiles = PlaylistProfile.query.all()
    return render_template('playlists/index.html', profiles=profiles)

@playlists_bp.route('/create', methods=['POST'])
def create_profile():
    name = request.form.get('name')
    slug = request.form.get('slug')
    PlaylistService.create_profile(name, slug)
    return redirect(url_for('playlists.index'))

@playlists_bp.route('/view/<int:id>')
def view_playlist(id):
    profile = PlaylistProfile.query.get_or_404(id)
    all_channels = Channel.query.all()
    return render_template('playlists/view.html', profile=profile, all_channels=all_channels)

@playlists_bp.route('/add-channel/<int:playlist_id>/<int:channel_id>', methods=['POST'])
def add_channel(playlist_id, channel_id):
    PlaylistService.add_channel_to_playlist(playlist_id, channel_id)
    return redirect(url_for('playlists.view_playlist', id=playlist_id))

@playlists_bp.route('/reorder/<int:playlist_id>', methods=['POST'])
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

    m3u_content = PlaylistService.generate_m3u(profile.id)
    return Response(m3u_content, mimetype='text/plain')
