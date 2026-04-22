from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from flask_login import login_required, current_user
from .services import SettingService

settings_bp = Blueprint('settings', __name__)

def _init_default_settings():
    # Ensure defaults exist (Only if they don't exist at all)
    if SettingService.get('ENABLE_PROXY_STATS') is None:
        SettingService.set('ENABLE_PROXY_STATS', 'true', type='bool', description='Enable server-side proxying for TS/HLS stats.')
    if SettingService.get('ENABLE_STREAM_MANAGER') is None:
        SettingService.set('ENABLE_STREAM_MANAGER', 'true', type='bool', description='Enable singleton stream sharing (TVHeadend Mode).')
    
    # Background Scan Settings
    if SettingService.get('ENABLE_AUTO_SCAN') is None:
        SettingService.set('ENABLE_AUTO_SCAN', 'false', type='bool', description='Enable periodic background health checks.')
    if SettingService.get('AUTO_SCAN_INTERVAL') is None:
        SettingService.set('AUTO_SCAN_INTERVAL', '6', type='int', description='Interval in hours between full scans.')
    if SettingService.get('SCAN_DELAY_SECONDS') is None:
        SettingService.set('SCAN_DELAY_SECONDS', '2', type='int', description='Delay in seconds between scanning each channel.')
    
    # Heartbeat & Health Optimizations
    if SettingService.get('ENABLE_HEALTH_SYSTEM') is None:
        SettingService.set('ENABLE_HEALTH_SYSTEM', 'true', type='bool', description='System Diagnostics Master Switch. If OFF, NO checks will run.')
    if SettingService.get('ENABLE_PASSIVE_CHECK') is None:
        SettingService.set('ENABLE_PASSIVE_CHECK', 'true', type='bool', description='Perform health check when a channel is accessed via link.')
    if SettingService.get('ENABLE_FFPROBE_DETAIL') is None:
        SettingService.set('ENABLE_FFPROBE_DETAIL', 'true', type='bool', description='Run heavy FFprobe analysis (CPU Intensive). If OFF, only basic status is verified.')
    if SettingService.get('HEARTBEAT_TTL_MINUTES') is None:
        SettingService.set('HEARTBEAT_TTL_MINUTES', '30', type='int', description='Time in minutes to skip re-checking a LIVE channel.')
    
    # Proxy Engine Settings
    if SettingService.get('ENABLE_TS_PROXY') is None:
        SettingService.set('ENABLE_TS_PROXY', 'true', type='bool', description='Enable TVHeadend-style Proxy for MPEG-TS streams.')
    if SettingService.get('ENABLE_HLS_PROXY') is None:
        SettingService.set('ENABLE_HLS_PROXY', 'true', type='bool', description='Enable RAM Caching Proxy for HLS streams.')
    
    # Advanced Tuning
    if SettingService.get('TS_BUFFER_SIZE') is None:
        SettingService.set('TS_BUFFER_SIZE', '128', type='int', description='Number of 16KB chunks in TS RAM buffer.')
    if SettingService.get('HLS_CACHE_TTL') is None:
        SettingService.set('HLS_CACHE_TTL', '60', type='int', description='Seconds to keep HLS segments in RAM.')
    if SettingService.get('HLS_MAX_SEGMENTS') is None:
        SettingService.set('HLS_MAX_SEGMENTS', '50', type='int', description='Max HLS segments per channel in RAM.')

    # End of initialization logic

@settings_bp.route('/admin/save', methods=['POST'])
@login_required
def save_settings():
    if current_user.role != 'admin': return jsonify({"status": "error"}), 403
    
    data = request.form
    # Proxy Engine toggles
    SettingService.set('ENABLE_TS_PROXY', 'true' if 'ENABLE_TS_PROXY' in data else 'false', type='bool')
    SettingService.set('ENABLE_HLS_PROXY', 'true' if 'ENABLE_HLS_PROXY' in data else 'false', type='bool')
    SettingService.set('ENABLE_PROXY_STATS', 'true' if 'ENABLE_PROXY_STATS' in data else 'false', type='bool')
    SettingService.set('ENABLE_STREAM_MANAGER', 'true' if 'ENABLE_STREAM_MANAGER' in data else 'false', type='bool')
    SettingService.set('ENABLE_AUTO_SCAN', 'true' if 'ENABLE_AUTO_SCAN' in data else 'false', type='bool')
    SettingService.set('ENABLE_HEALTH_SYSTEM', 'true' if 'ENABLE_HEALTH_SYSTEM' in data else 'false', type='bool')
    SettingService.set('ENABLE_PASSIVE_CHECK', 'true' if 'ENABLE_PASSIVE_CHECK' in data else 'false', type='bool')
    SettingService.set('ENABLE_FFPROBE_DETAIL', 'true' if 'ENABLE_FFPROBE_DETAIL' in data else 'false', type='bool')
    
    if 'AUTO_SCAN_INTERVAL' in data:
        SettingService.set('AUTO_SCAN_INTERVAL', data['AUTO_SCAN_INTERVAL'], type='int')
    if 'SCAN_DELAY_SECONDS' in data:
        SettingService.set('SCAN_DELAY_SECONDS', data['SCAN_DELAY_SECONDS'], type='int')
    if 'HEARTBEAT_TTL_MINUTES' in data:
        SettingService.set('HEARTBEAT_TTL_MINUTES', data['HEARTBEAT_TTL_MINUTES'], type='int')
    
    # Advanced Tuning
    if 'TS_BUFFER_SIZE' in data:
        SettingService.set('TS_BUFFER_SIZE', data['TS_BUFFER_SIZE'], type='int')
    if 'HLS_CACHE_TTL' in data:
        SettingService.set('HLS_CACHE_TTL', data['HLS_CACHE_TTL'], type='int')
    if 'HLS_MAX_SEGMENTS' in data:
        SettingService.set('HLS_MAX_SEGMENTS', data['HLS_MAX_SEGMENTS'], type='int')
    
    if 'CUSTOM_USER_AGENT' in data:
        SettingService.set('CUSTOM_USER_AGENT', data['CUSTOM_USER_AGENT'], description='Custom User-Agent for all proxy requests.')
    
    # CentralAuth SSO Settings
    SettingService.set('USE_CENTRAL_AUTH', 'true' if 'USE_CENTRAL_AUTH' in data else 'false', type='bool')
    
    # Consolidated SSO URL Support (3-field layout)
    if 'CENTRAL_AUTH_URL' in data and data['CENTRAL_AUTH_URL']:
        url = data['CENTRAL_AUTH_URL'].rstrip('/')
        SettingService.set('CENTRAL_AUTH_API_URL', url)
        SettingService.set('CENTRAL_SSO_WEB_URL', url)
    else:
        # Legacy support for separate fields (if still present)
        if 'CENTRAL_AUTH_API_URL' in data:
            SettingService.set('CENTRAL_AUTH_API_URL', data['CENTRAL_AUTH_API_URL'])
        if 'CENTRAL_SSO_WEB_URL' in data:
            SettingService.set('CENTRAL_SSO_WEB_URL', data['CENTRAL_SSO_WEB_URL'])
            
    if 'CENTRAL_AUTH_CLIENT_ID' in data:
        SettingService.set('CENTRAL_AUTH_CLIENT_ID', data['CENTRAL_AUTH_CLIENT_ID'])
    if 'CENTRAL_AUTH_CLIENT_SECRET' in data:
        SettingService.set('CENTRAL_AUTH_CLIENT_SECRET', data['CENTRAL_AUTH_CLIENT_SECRET'])

    flash('Settings saved successfully.')
    return redirect(url_for('admin_portal'))

@settings_bp.route('/admin/test-sso', methods=['POST'])
@login_required
def test_sso_connection():
    """Test connection to CentralAuth with provided parameters."""
    if current_user.role != 'admin':
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    data = request.get_json()
    api_url = data.get('api_url')
    client_id = data.get('client_id')
    client_secret = data.get('client_secret')
    
    if not api_url:
        return jsonify({"status": "error", "message": "API URL is required"}), 400
        
    from app.core.sso.central_auth_client import CentralAuthClient
    # Use provided values for testing, or fall back to saved ones
    test_client = CentralAuthClient(api_url=api_url, client_id=client_id, client_secret=client_secret)
    
    if test_client.check_health():
        return jsonify({"status": "success", "message": "Successfully connected to CentralAuth!"})
    else:
        return jsonify({"status": "error", "message": "Could not reach CentralAuth. Check URL and Network."})

@settings_bp.route('/toggle', methods=['POST'])
@login_required
def toggle_setting_api():
    if current_user.role != 'admin': return jsonify({"status": "error"}), 403
    data = request.get_json()
    key = data.get('key')
    value = data.get('value')
    if key and value is not None:
        SettingService.set(key, 'true' if value else 'false', type='bool')
        return jsonify({"status": "ok"})
    return jsonify({"status": "error"}), 400

@settings_bp.route('/all', methods=['GET'])
@login_required
def get_all_settings_json():
    if current_user.role != 'admin': return jsonify({"status": "error"}), 403
    
    # Trigger initialization of defaults
    _init_default_settings() 
    
    settings = SettingService.get_all()
    return jsonify([{
        'key': s.key,
        'value': s.value,
        'description': s.description,
        'type': s.type
    } for s in settings])

@settings_bp.route('/save_val', methods=['POST'])
@login_required
def save_setting_val():
    if current_user.role != 'admin': return jsonify({"status": "error"}), 403
    data = request.get_json()
    key = data.get('key')
    value = data.get('value')
    s_type = data.get('type', 'string')
    
    if key and value is not None:
        SettingService.set(key, value, type=s_type)
        return jsonify({"status": "ok"})
    return jsonify({"status": "error"}), 400

from flask import Response
from .services import BackupService
from datetime import datetime

@settings_bp.route('/backup/export')
@login_required
def export_backup():
    if current_user.role != 'admin':
        return "Unauthorized", 403
        
    json_data = BackupService.export_database()
    filename = f"iptv_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    return Response(
        json_data,
        mimetype="application/json",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )

@settings_bp.route('/backup/import', methods=['POST'])
@login_required
def import_backup():
    if current_user.role != 'admin':
        return jsonify({"success": False, "message": "Unauthorized"}), 403
        
    if 'backup_file' not in request.files:
        return jsonify({"success": False, "message": "Không tìm thấy file!"})
        
    file = request.files['backup_file']
    if file.filename == '':
        return jsonify({"success": False, "message": "Chưa chọn file!"})
        
    if not file.filename.endswith('.json'):
        return jsonify({"success": False, "message": "Chỉ chấp nhận file .json!"})
        
    try:
        json_data = file.read().decode('utf-8')
        success, msg = BackupService.import_database(json_data)
        return jsonify({"success": success, "message": msg})
    except Exception as e:
        return jsonify({"success": False, "message": f"Lỗi đọc file: {str(e)}"})
