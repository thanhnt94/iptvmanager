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
        'priority': s.priority,
        'last_sync': s.last_sync_at.strftime('%Y-%m-%d %H:%M:%S') if s.last_sync_at else 'Never'
    } for s in sources])

@epg_bp.route('/hints', methods=['GET'])
@login_required
def get_epg_hints():
    from app.modules.channels.models import EPGData
    # Return unique epg_ids in the system
    ids = db.session.query(EPGData.epg_id).distinct().all()
    return jsonify([i[0] for i in ids if i[0]])

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

@epg_bp.route('/programs', methods=['GET'])
@login_required
def list_programs():
    from app.modules.channels.models import EPGData, EPGSource
    from datetime import datetime, timedelta
    
    date_str = request.args.get('date') # expected YYYY-MM-DD
    try:
        if date_str:
            start_look = datetime.strptime(date_str, '%Y-%m-%d')
        else:
            start_look = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    except:
        start_look = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    end_look = start_look + timedelta(days=1, hours=6) # 30h window
    
    programs = EPGData.query.filter(
        EPGData.start >= start_look,
        EPGData.start <= end_look
    ).all()
    
    sources = {s.id: s.priority for s in EPGSource.query.all()}
    
    return jsonify([{
        'id': p.id,
        'epg_id': p.epg_id,
        'title': p.title,
        'desc': p.desc,
        'start': p.start.isoformat(),
        'stop': p.stop.isoformat(),
        'is_manual': p.owner_id is not None,
        'priority': 10000 if p.owner_id else sources.get(p.source_id, 0)
    } for p in programs])

@epg_bp.route('/programs', methods=['POST'])
@login_required
def add_program():
    data = request.json
    epg_id = data.get('epg_id')
    title = data.get('title')
    start_str = data.get('start')
    stop_str = data.get('stop')
    desc = data.get('desc')
    
    if not epg_id or not title or not start_str or not stop_str:
        return jsonify({'error': 'Missing required fields'}), 400
        
    from datetime import datetime
    try:
        start_dt = datetime.strptime(start_str, '%Y-%m-%dT%H:%M')
        stop_dt = datetime.strptime(stop_str, '%Y-%m-%dT%H:%M')
    except:
        try:
            start_dt = datetime.strptime(start_str, '%Y-%m-%d %H:%M:%S')
            stop_dt = datetime.strptime(stop_str, '%Y-%m-%d %H:%M:%S')
        except:
            return jsonify({'error': 'Invalid date format'}), 400
            
    prog = EPGService.add_manual_program(epg_id, title, start_dt, stop_dt, desc, current_user.id)
    return jsonify({'status': 'ok', 'id': prog.id})

@epg_bp.route('/programs/<int:id>', methods=['DELETE'])
@login_required
def delete_program(id):
    from app.modules.channels.models import EPGData
    prog = EPGData.query.get(id)
    if not prog or prog.owner_id != current_user.id:
        return jsonify({'error': 'Unauthorized or Not Found'}), 403
    
    db.session.delete(prog)
    db.session.commit()
    return jsonify({'status': 'ok'})

@epg_bp.route('/import-file', methods=['POST'])
@login_required
def import_epg_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    content = file.read().decode('utf-8', 'ignore')
    result = EPGService.import_xmltv(content, current_user.id)
    return jsonify(result)

@epg_bp.route('/import-url', methods=['POST'])
@login_required
def import_epg_url():
    data = request.json
    url = data.get('url')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
        
    result = EPGService.import_xmltv_from_url(url, current_user.id)
    return jsonify(result)
