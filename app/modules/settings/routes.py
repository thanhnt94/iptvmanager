from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from flask_login import login_required, current_user
from .services import SettingService

settings_bp = Blueprint('settings', __name__, template_folder='templates')

@settings_bp.route('/admin')
@login_required
def admin_settings():
    if current_user.role != 'admin':
        flash('Access denied.')
        return redirect(url_for('index'))
    
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

    from app.modules.playlists.models import PlaylistProfile
    playlists = PlaylistProfile.query.all()
    
    return render_template('settings/admin.html', settings=SettingService.get_all(), playlists=playlists)

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
    
    if 'AUTO_SCAN_INTERVAL' in data:
        SettingService.set('AUTO_SCAN_INTERVAL', data['AUTO_SCAN_INTERVAL'], type='int')
    if 'SCAN_DELAY_SECONDS' in data:
        SettingService.set('SCAN_DELAY_SECONDS', data['SCAN_DELAY_SECONDS'], type='int')
    
    # Advanced Tuning
    if 'TS_BUFFER_SIZE' in data:
        SettingService.set('TS_BUFFER_SIZE', data['TS_BUFFER_SIZE'], type='int')
    if 'HLS_CACHE_TTL' in data:
        SettingService.set('HLS_CACHE_TTL', data['HLS_CACHE_TTL'], type='int')
    if 'HLS_MAX_SEGMENTS' in data:
        SettingService.set('HLS_MAX_SEGMENTS', data['HLS_MAX_SEGMENTS'], type='int')
    
    if 'CUSTOM_USER_AGENT' in data:
        SettingService.set('CUSTOM_USER_AGENT', data['CUSTOM_USER_AGENT'], description='Custom User-Agent for all proxy requests.')
    
    flash('Settings saved successfully.')
    return redirect(url_for('settings.admin_settings'))

@settings_bp.route('/api/toggle', methods=['POST'])
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
