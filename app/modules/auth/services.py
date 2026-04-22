from app.modules.auth.models import User, UserPlaylist
from app.core.database import db
from flask import abort
from flask_login import current_user
from functools import wraps

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

class AuthService:
    @staticmethod
    def ensure_admin_user():
        """Creates or updates the default admin/admin user."""
        from app.modules.playlists.services import PlaylistService
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(username='admin', role='admin')
            admin.set_password('admin')
            db.session.add(admin)
            db.session.commit() # Commit to get ID
        else:
            # Upgrade existing admin if role not set
            if admin.role != 'admin':
                admin.role = 'admin'
                db.session.commit()
        
        PlaylistService.ensure_user_default_playlists(admin)
        return admin

    @staticmethod
    def get_all_users():
        return User.query.all()

    @staticmethod
    def create_user(username, email, password, role='user'):
        from app.modules.playlists.services import PlaylistService
        if not email:
            return None, "Email is required"
        if User.query.filter_by(username=username).first():
            return None, "Username already exists"
        if User.query.filter_by(email=email).first():
            return None, "Email already registered"
        
        user = User(username=username, email=email, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        # New: Auto-generate default playlists
        PlaylistService.ensure_user_default_playlists(user)
        
        return user, None

    @staticmethod
    def delete_user(user_id):
        user = User.query.get(user_id)
        if user and user.username != 'admin':
            # Remove playlist associations first (though cascade is set)
            UserPlaylist.query.filter_by(user_id=user_id).delete()
            db.session.delete(user)
            db.session.commit()
            return True
        return False

    @staticmethod
    def toggle_playlist_access(user_id, playlist_id):
        access = UserPlaylist.query.filter_by(user_id=user_id, playlist_id=playlist_id).first()
        if access:
            db.session.delete(access)
        else:
            access = UserPlaylist(user_id=user_id, playlist_id=playlist_id)
            db.session.add(access)
        db.session.commit()
        return True
    @staticmethod
    def update_user_role(user_id, role):
        user = User.query.get(user_id)
        if user and user.username != 'admin':
            if role in ['admin', 'vip', 'free']:
                user.role = role
                db.session.commit()
                return True
        return False

    @staticmethod
    def get_user_by_id(user_id):
        return User.query.get(int(user_id))

    @staticmethod
    def get_user_by_username(username):
        return User.query.filter_by(username=username).first()

    @staticmethod
    def get_user_playlists(user_id):
        from app.modules.playlists.models import PlaylistProfile
        return db.session.query(PlaylistProfile).join(
            UserPlaylist, PlaylistProfile.id == UserPlaylist.playlist_id
        ).filter(UserPlaylist.user_id == user_id).all()
