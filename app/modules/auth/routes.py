from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from app.modules.auth.services import AuthService, admin_required
from app.modules.playlists.models import PlaylistProfile

auth_bp = Blueprint('auth', __name__, template_folder='templates')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        if current_user.role == 'admin':
            return redirect(url_for('channels.index'))
        return redirect(url_for('auth.dashboard'))
        
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = True if request.form.get('remember') else False
        
        user = AuthService.get_user_by_username(username)
        
        if not user or not user.check_password(password):
            flash('Please check your login details and try again.', 'danger')
            return redirect(url_for('auth.login'))
            
        login_user(user, remember=remember)
        if user.role == 'admin':
            return redirect(url_for('channels.index'))
        return redirect(url_for('auth.dashboard'))
        
    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
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
        password = request.form.get('password')
        role = request.form.get('role', 'user')
        
        if username and password:
            user, error = AuthService.create_user(username, password, role)
            if user:
                flash(f'User {username} created successfully.', 'success')
            else:
                flash(error, 'danger')
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
