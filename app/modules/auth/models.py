"""
Auth Models () — Standalone SQLAlchemy, no Flask dependency.
"""
import secrets
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

from app.core.database import Base


class UserPlaylist(Base):
    """Junction table for User <-> Playlist access."""
    __tablename__ = 'user_playlists'
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlist_profiles.id', ondelete='CASCADE'), primary_key=True)


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(256))
    full_name = Column(String(100))
    avatar_url = Column(String(255))
    role = Column(String(20), default='free')  # 'admin', 'vip', or 'free'
    is_active = Column(Boolean, default=True)
    api_token = Column(String(64), unique=True, nullable=False, index=True)
    central_auth_id = Column(String(36), unique=True, index=True, nullable=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.api_token:
            self.api_token = secrets.token_hex(24)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    def is_admin(self) -> bool:
        return self.role == 'admin'

    # Flask-Login compatibility (for any remaining legacy paths)
    @property
    def is_authenticated(self):
        return True

    def __repr__(self):
        return f'<User {self.username} ({self.role})>'


class TrustedIP(Base):
    __tablename__ = 'trusted_ips'
    id = Column(Integer, primary_key=True)
    ip_address = Column(String(45), unique=True, nullable=False, index=True)
    last_seen = Column(DateTime, default=func.now())

    def __repr__(self):
        return f'<TrustedIP {self.ip_address}>'


class UserSession(Base):
    """
    Tracks active server-side sessions for a user.
    Used for implementing Back-channel Logout.
    """
    __tablename__ = 'user_sessions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    session_id = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=func.now())

