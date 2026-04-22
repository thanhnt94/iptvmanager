from flask import Blueprint, request, jsonify, current_app, redirect, url_for
from flask_login import login_user, logout_user, login_required, current_user
from app.modules.auth.services import AuthService, admin_required
from app.modules.playlists.models import PlaylistProfile

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/me', methods=['GET'])
def me():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'role': current_user.role,
        'avatar_initial': current_user.username[0].upper()
    })

@auth_bp.route('/config', methods=['GET'])
def get_config():
    # Detect if we should force local auth (e.g. from /admin portal)
    force_local = request.args.get('force_local') == 'true'
    
    from app.modules.settings.models import SystemSetting
    use_sso = SystemSetting.query.filter_by(key='USE_CENTRAL_AUTH').first()
    
    is_sso_active = use_sso.value.lower() == 'true' if use_sso else False
    
    # Override SSO if force_local is requested
    if force_local:
        is_sso_active = False

    return jsonify({
        "use_sso": is_sso_active,
        "tenant_id": "iptv-manager",
        "app_name": "IPTV Manager"
    })

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    remember = data.get('remember', False)
    
    user = AuthService.get_user_by_username(username)
    if user and user.check_password(password):
        login_user(user, remember=remember)
        return jsonify({
            'status': 'ok',
            'user': {
                'id': user.id,
                'username': user.username,
                'role': user.role,
                'api_token': user.api_token
            }
        })
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

@auth_bp.route('/logout', methods=['GET', 'POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'status': 'ok'})

@auth_bp.route('/users', methods=['GET'])
@login_required
@admin_required
def get_users():
    users = AuthService.get_all_users()
    from app.modules.auth.models import UserPlaylist
    
    result = []
    for user in users:
        accesses = UserPlaylist.query.filter_by(user_id=user.id).all()
        result.append({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'playlists': [a.playlist_id for a in accesses]
        })
    return jsonify(result)

@auth_bp.route('/users', methods=['POST'])
@login_required
@admin_required
def create_user():
    data = request.json
    user, error = AuthService.create_user(
        data.get('username'),
        data.get('email'),
        data.get('password'),
        data.get('role', 'user')
    )
    if user:
        return jsonify({'status': 'ok', 'id': user.id})
    return jsonify({'status': 'error', 'message': error}), 400

@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_user(user_id):
    if AuthService.delete_user(user_id):
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'error'}), 400

@auth_bp.route('/toggle-access/<int:user_id>/<int:playlist_id>', methods=['POST'])
@login_required
@admin_required
def toggle_access(user_id, playlist_id):
    AuthService.toggle_playlist_access(user_id, playlist_id)
    return jsonify({'status': 'ok'})

@auth_bp.route('/users/<int:user_id>/role', methods=['POST'])
@login_required
@admin_required
def update_user_role(user_id):
    data = request.json
    role = data.get('role')
    if AuthService.update_user_role(user_id, role):
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'error', 'message': 'Failed to update role'}), 400
