"""
Auth Service () — Uses injected Session, no Flask dependency.
"""
import logging
from sqlalchemy.orm import Session

from app.modules.auth.models import User, UserPlaylist

logger = logging.getLogger('iptv')


class AuthService:
    @staticmethod
    def ensure_admin_user(db: Session) -> User:
        """Creates or ensures the default admin user exists."""
        from app.modules.playlists.services import PlaylistService
        admin = db.query(User).filter_by(username='admin').first()
        if not admin:
            admin = User(username='admin', email='admin@iptv.local', role='admin', full_name='System Administrator')
            admin.set_password('admin')
            db.add(admin)
            db.commit()
        elif admin.role != 'admin':
            admin.role = 'admin'
            db.commit()
        PlaylistService.ensure_user_default_playlists(db, admin)
        return admin

    @staticmethod
    def get_all_users(db: Session):
        return db.query(User).all()

    @staticmethod
    def create_user(db: Session, username: str, email: str, password: str, role: str = 'user'):
        from app.modules.playlists.services import PlaylistService
        if not email:
            return None, "Email is required"
        if db.query(User).filter_by(username=username).first():
            return None, "Username already exists"
        if db.query(User).filter_by(email=email).first():
            return None, "Email already registered"

        user = User(username=username, email=email, role=role)
        user.set_password(password)
        db.add(user)
        db.commit()
        PlaylistService.ensure_user_default_playlists(db, user)
        return user, None

    @staticmethod
    def delete_user(db: Session, user_id: int) -> bool:
        user = db.query(User).get(user_id)
        if user and user.username != 'admin':
            db.query(UserPlaylist).filter_by(user_id=user_id).delete()
            db.delete(user)
            db.commit()
            return True
        return False

    @staticmethod
    def toggle_playlist_access(db: Session, user_id: int, playlist_id: int):
        access = db.query(UserPlaylist).filter_by(user_id=user_id, playlist_id=playlist_id).first()
        if access:
            db.delete(access)
        else:
            db.add(UserPlaylist(user_id=user_id, playlist_id=playlist_id))
        db.commit()
        return True

    @staticmethod
    def update_user_role(db: Session, user_id: int, role: str) -> bool:
        user = db.query(User).get(user_id)
        if user and user.username != 'admin' and role in ['admin', 'vip', 'free']:
            user.role = role
            db.commit()
            return True
        return False

    @staticmethod
    def update_profile(db: Session, user_id: int, full_name: str = None, email: str = None):
        user = db.query(User).get(user_id)
        if not user:
            return False, "User not found"
        if email and email != user.email:
            if db.query(User).filter_by(email=email).first():
                return False, "Email already in use"
            user.email = email
        if full_name is not None:
            user.full_name = full_name
        db.commit()
        return True, "Profile updated"

    @staticmethod
    def change_password(db: Session, user_id: int, old_password: str, new_password: str):
        user = db.query(User).get(user_id)
        if not user:
            return False, "User not found"
        if not user.check_password(old_password):
            return False, "Incorrect old password"
        user.set_password(new_password)
        db.commit()
        return True, "Password changed"

    @staticmethod
    def get_user_by_id(db: Session, user_id: int):
        return db.query(User).get(int(user_id))

    @staticmethod
    def get_user_by_username(db: Session, username: str):
        return db.query(User).filter_by(username=username).first()

