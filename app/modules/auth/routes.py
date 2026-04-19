from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user
from app.modules.auth.services import AuthService, admin_required
from app.modules.playlists.models import PlaylistProfile

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    from app.modules.settings.models import SystemSetting
    use_sso = SystemSetting.query.filter_by(key='USE_CENTRAL_AUTH').first()
    if request.method == 'GET' and use_sso and use_sso.value.lower() == 'true':
        # HEARTBEAT CHECK: Verify if Central Auth is actually reachable before redirecting
        api_url = SystemSetting.query.filter_by(key='CENTRAL_AUTH_API_URL').first()
        if api_url:
            try:
                # Fast ping to health endpoint
                health_check_url = f"{api_url.value.rstrip('/')}/api/health"
                requests.get(health_check_url, timeout=0.8)
                # If we reach here, service is up
                return redirect(url_for('auth_center.login'))
            except Exception as e:
                # Service is down or unreachable, do NOT redirect. Fallback to local login.
                current_app.logger.warning(f"SSO Heartbeat failed: {e}. Falling back to local login.")
                flash("Central Auth is currently unavailable. Using local fallback.", "warning")

    if current_user.is_authenticated:
        if current_user.role == 'admin':
            return redirect(url_for('channels.index'))
        return redirect(url_for('auth.dashboard'))
        
    if request.method == 'POST':
        return process_local_login()
        
    return render_template('auth/login.html')

@auth_bp.route('/emergency-login', methods=['GET', 'POST'])
def emergency_login():
    """Emergency Local Login: ALWAYS bypasses SSO redirection."""
    if current_user.is_authenticated:
        return redirect(url_for('channels.index'))
        
    if request.method == 'POST':
        return process_local_login()
        
    return render_template('auth/login.html', emergency=True)

def process_local_login():
    """Helper to process standard username/password login."""
    username = request.form.get('username')
    password = request.form.get('password')
    remember = True if request.form.get('remember') else False
    
    user = AuthService.get_user_by_username(username)
    
    if not user or not user.check_password(password):
        flash('Please check your login details and try again.', 'danger')
        return redirect(request.referrer or url_for('auth.login'))
        
    login_user(user, remember=remember)
    if user.role == 'admin':
        return redirect(url_for('channels.index'))
    return redirect(url_for('auth.dashboard'))

@auth_bp.route('/logout')
@login_required
def logout():
    from app.modules.settings.models import SystemSetting
    use_sso = SystemSetting.query.filter_by(key='USE_CENTRAL_AUTH').first()
    
    logout_user()
    
    if use_sso and use_sso.value.lower() == 'true':
        api_url = SystemSetting.query.filter_by(key='CENTRAL_AUTH_API_URL').first()
        if api_url:
            return redirect(f"{api_url.value.rstrip('/')}/api/auth/logout")

    return redirect(url_for('auth.login'))

@auth_bp.route('/dashboard')
@login_required
def dashboard():
    if current_user.role == 'admin':
        return redirect(url_for('channels.index'))
    
    playlists = AuthService.get_user_playlists(current_user.id)
    return render_template('auth/dashboard.html', playlists=playlists)

@auth_bp.route('/admin/users', methods=['GET', 'POST'])
@login_required
@admin_required
def admin_users():
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        role = request.form.get('role', 'user')
        
        if username and email and password:
            user, error = AuthService.create_user(username, email, password, role)
            if user:
                flash(f'User {username} ({email}) created successfully.', 'success')
            else:
                flash(error, 'danger')
        else:
            flash('Username, Email, and Password are required.', 'warning')
        return redirect(url_for('auth.admin_users'))
        
    users = AuthService.get_all_users()
    all_playlists = PlaylistProfile.query.all()
    
    # Build a map of user_id -> set of playlist_ids for easy template checking
    from app.modules.auth.models import UserPlaylist
    user_access_map = {}
    for user in users:
        accesses = UserPlaylist.query.filter_by(user_id=user.id).all()
        user_access_map[user.id] = {a.playlist_id for a in accesses}
        
    return render_template('auth/users.html', users=users, playlists=all_playlists, user_access_map=user_access_map)

@auth_bp.route('/admin/delete-user/<int:user_id>', methods=['POST'])
@login_required
@admin_required
def delete_user(user_id):
    if AuthService.delete_user(user_id):
        flash('User deleted successfully.', 'success')
    else:
        flash('Could not delete user.', 'danger')
    return redirect(url_for('auth.admin_users'))

@auth_bp.route('/admin/toggle-access/<int:user_id>/<int:playlist_id>', methods=['POST'])
@login_required
@admin_required
def toggle_access(user_id, playlist_id):
    AuthService.toggle_playlist_access(user_id, playlist_id)
    return jsonify({'status': 'ok'})

