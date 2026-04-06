from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from app.core.database import db
import secrets

# Junction table for User <-> Playlist (User has access to Playlist)
class UserPlaylist(db.Model):
    __tablename__ = 'user_playlists'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    playlist_id = db.Column(db.Integer, db.ForeignKey('playlist_profiles.id', ondelete='CASCADE'), primary_key=True)

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256))
    full_name = db.Column(db.String(100))
    avatar_url = db.Column(db.String(255))
    role = db.Column(db.String(20), default='user') # 'admin' or 'user'
    is_active = db.Column(db.Boolean, default=True)
    api_token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    central_auth_id = db.Column(db.String(36), unique=True, index=True, nullable=True) # UUID from CentralAuth

    def __init__(self, **kwargs):
        super(User, self).__init__(**kwargs)
        if not self.api_token:
            self.api_token = secrets.token_hex(24)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def is_admin(self):
        return self.role == 'admin'

    def __repr__(self):
        return f'<User {self.username} ({self.role})>'

class TrustedIP(db.Model):
    __tablename__ = 'trusted_ips'
    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), unique=True, nullable=False, index=True)
    last_seen = db.Column(db.DateTime, default=db.func.now())
    
    def __repr__(self):
        return f'<TrustedIP {self.ip_address}>'

class UserSession(db.Model):
    """
    Explicitly tracks active server-side sessions for a user.
    Used for implementing Back-channel Logout by deleting session records.
    """
    __tablename__ = 'user_sessions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    session_id = db.Column(db.String(255), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())
