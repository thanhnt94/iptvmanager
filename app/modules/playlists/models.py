"""
Playlist Models — Standalone SQLAlchemy, no Flask dependency.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class PlaylistProfile(Base):
    __tablename__ = 'playlist_profiles'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False)
    security_token = Column(String(128), unique=True)
    allowed_ips = Column(Text)
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)
    is_dynamic = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    entries = relationship('PlaylistEntry', back_populates='playlist', cascade='all, delete-orphan',
                           order_by='PlaylistEntry.order_index')
    groups = relationship('PlaylistGroup', back_populates='playlist', cascade='all, delete-orphan')


class PlaylistGroup(Base):
    __tablename__ = 'playlist_groups'
    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlist_profiles.id'), nullable=False)
    name = Column(String(255), nullable=False)
    order_index = Column(Integer, default=0)

    # Relationships
    playlist = relationship('PlaylistProfile', back_populates='groups')
    entries = relationship('PlaylistEntry', back_populates='group')


class PlaylistEntry(Base):
    __tablename__ = 'playlist_entries'

    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlist_profiles.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    group_id = Column(Integer, ForeignKey('playlist_groups.id'))
    custom_group = Column(String(255))
    custom_name = Column(String(255))
    order_index = Column(Integer, default=0)

    # Relationships
    playlist = relationship('PlaylistProfile', back_populates='entries')
    channel = relationship('Channel')
    group = relationship('PlaylistGroup', back_populates='entries')
