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
    password_hash = db.Column(db.String(256))
    role = db.Column(db.String(20), default='user') # 'admin' or 'user'
    api_token = db.Column(db.String(64), unique=True, nullable=False, index=True)

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
