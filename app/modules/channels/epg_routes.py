from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.modules.channels.services import EPGService
from app.core.database import db

epg_bp = Blueprint('epg', __name__)

@epg_bp.route('/sources', methods=['GET'])
@login_required
def list_sources():
    sources = EPGService.get_sources()
    return jsonify([{
        'id': s.id,
        'name': s.name,
        'url': s.url,
        'last_sync': s.last_sync_at.strftime('%Y-%m-%d %H:%M:%S') if s.last_sync_at else 'Never'
    } for s in sources])

@epg_bp.route('/sources', methods=['POST'])
@login_required
def add_source():
    if current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    name = data.get('name')
    url = data.get('url')
    if not name or not url:
        return jsonify({'error': 'Name and URL are required'}), 400
    
    source = EPGService.add_source(name, url)
    return jsonify({'status': 'ok', 'id': source.id})

@epg_bp.route('/sources/<int:id>', methods=['DELETE'])
@login_required
def delete_source(id):
    if current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    success = EPGService.delete_source(id)
    return jsonify({'status': 'ok' if success else 'error'})

@epg_bp.route('/sources/<int:id>/sync', methods=['POST'])
@login_required
def sync_source(id):
    if current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    result = EPGService.sync_epg(id)
    return jsonify(result)
