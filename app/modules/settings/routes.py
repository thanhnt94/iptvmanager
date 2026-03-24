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
    
    return render_template('settings/admin.html', settings=SettingService.get_all())

@settings_bp.route('/admin/save', methods=['POST'])
@login_required
def save_settings():
    if current_user.role != 'admin': return jsonify({"status": "error"}), 403
    
    data = request.form
    # Checkbox handling in Flask (only present if checked)
    SettingService.set('ENABLE_PROXY_STATS', 'true' if 'ENABLE_PROXY_STATS' in data else 'false', type='bool')
    SettingService.set('ENABLE_STREAM_MANAGER', 'true' if 'ENABLE_STREAM_MANAGER' in data else 'false', type='bool')
    
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
