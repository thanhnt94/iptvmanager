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

@health_bp.route('/admin/tasks', methods=['GET'])
@login_required
def admin_tasks():
    """Admin-only: Returns detailed Celery and Scanner status."""
    from flask_login import current_user
    if current_user.role != 'admin':
        return jsonify({"status": "error", "message": "Admin only"}), 403
        
    celery = current_app.celery_app
    # Note: inspect() might have limited info on SQLite broker but good for active tasks
    i = celery.control.inspect()
    active = i.active() or {}
    scheduled = i.scheduled() or {}
    reserved = i.reserved() or {}
    
    scanner_status = HealthCheckService.get_status()
    
    # FIX for SQLite: If scanner is running but Celery reports 0 active tasks,
    # inject a synthetic task so the UI shows what's happening.
    if scanner_status and scanner_status.get('is_running') and not any(active.values()):
        active['InternalWorker'] = [{
            'id': 'scanner-process',
            'name': f"Health Scan: {scanner_status.get('current_name') or 'Initializing'}",
            'time_start': None,
            'args': [],
            'kwargs': {'playlist_id': scanner_status.get('playlist_id')}
        }]
    
    return jsonify({
        "status": "ok",
        "active": active,
        "scheduled": scheduled,
        "reserved": reserved,
        "scanner": scanner_status or {}
    })

@health_bp.route('/admin/tasks/purge', methods=['POST'])
@login_required
def purge_tasks():
    """Admin-only: Clears all pending tasks in the Celery queue."""
    from flask_login import current_user
    if current_user.role != 'admin':
        return jsonify({"status": "error", "message": "Admin only"}), 403
        
    celery = current_app.celery_app
    count = celery.control.purge()
    
    # Also signal any running scan to stop
    from app.modules.health.services import HealthCheckService
    HealthCheckService.stop_scan()
    
    return jsonify({"status": "ok", "purged_count": count})

@health_bp.route('/admin/tasks/reset', methods=['POST'])
@login_required
def reset_scanner():
    """Admin-only: Forces scanner state to IDLE and stops current logic."""
    from flask_login import current_user
    if current_user.role != 'admin':
        return jsonify({"status": "error", "message": "Admin only"}), 403
    
    from app.modules.health.models import ScannerStatus
    from app.core.database import db
    
    db.session.rollback()
    state = ScannerStatus.get_singleton()
    state.is_running = False
    state.stop_requested = True # Force stop signal to any zombie worker
    state.current = 0
    state.total = 0
    db.session.commit()
    
    return jsonify({"status": "ok", "message": "Scanner engine reset successfully"})
