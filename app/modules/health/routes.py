from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required
from app.modules.health.services import HealthCheckService
from app.modules.channels.models import Channel
from app.modules.playlists.models import PlaylistProfile
from app.core.database import db

health_bp = Blueprint('health', __name__)

@health_bp.route('/status', methods=['GET'])
@login_required
def get_scan_status():
    """Returns the current background scan state."""
    return jsonify(HealthCheckService.get_status())

@health_bp.route('/start', methods=['POST'])
@login_required
def start_scan():
    """Triggers a new background scan with options."""
    data = request.json or {}
    mode = data.get('mode', 'all')
    days = data.get('days')
    playlist_id = data.get('playlist_id')
    group = data.get('group')
    delay = data.get('delay')
    
    # Pass the actual app object for thread context
    app = current_app._get_current_object()
    HealthCheckService.start_background_scan(app, mode=mode, days=days, playlist_id=playlist_id, group=group, delay=delay)
    
    return jsonify({"status": "ok", "message": "Scan initiated"})

@health_bp.route('/stop', methods=['POST'])
@login_required
def stop_scan():
    """Aborts any running background scan."""
    HealthCheckService.stop_scan()
    return jsonify({"status": "ok", "message": "Stop request sent"})

@health_bp.route('/options', methods=['GET'])
@login_required
def get_scan_options():
    """Returns lists of Groups and Playlists for populating UI selectors."""
    groups = [c[0] for c in db.session.query(Channel.group_name).distinct().filter(Channel.group_name != None).all()]
    playlists = PlaylistProfile.query.filter_by(is_system=False).all()
    
    return jsonify({
        'groups': sorted(groups),
        'playlists': [{
            'id': p.id,
            'name': p.name
        } for p in playlists]
    })

@health_bp.route('/batch-check', methods=['POST'])
@login_required
def batch_check():
    data = request.json or {}
    ids = data.get('ids', [])
    fast_mode = data.get('fast_mode', False)
    
    if not ids:
        return jsonify({'status': 'error', 'message': 'No IDs provided'}), 400
        
    results = HealthCheckService.batch_check_streams(ids, fast_mode=fast_mode)
    return jsonify({'status': 'ok', 'results': results})
