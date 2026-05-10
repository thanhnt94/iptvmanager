"""
Playlist Models () — Standalone SQLAlchemy, no Flask dependency.
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
    owner_id = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Auto-scan settings
    auto_scan_enabled = Column(Boolean, default=False)
    auto_scan_interval = Column(Integer, default=1440)
    auto_scan_time = Column(String(5), nullable=True)
    last_auto_scan_at = Column(DateTime)

    # Dynamic Website-based Playlist
    is_dynamic = Column(Boolean, default=False)
    website_url = Column(String(512))
    scanner_type = Column(String(50), default='generic')
    last_synced_at = Column(DateTime)

    # Live Scanning Status
    is_scanning = Column(Boolean, default=False)
    current_scanning_name = Column(String(255))

    # Relationships
    entries = relationship('PlaylistEntry', back_populates='playlist', cascade='all, delete-orphan',
                           order_by='PlaylistEntry.order_index')
    groups = relationship('PlaylistGroup', back_populates='playlist', cascade='all, delete-orphan')
    discovery_items = relationship('DiscoveryChannel', back_populates='playlist', cascade='all, delete-orphan')


class PlaylistGroup(Base):
    __tablename__ = 'playlist_groups'
    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlist_profiles.id'), nullable=False)
    name = Column(String(255), nullable=False)
    order_index = Column(Integer, default=0)

    # Relationships
    playlist = relationship('PlaylistProfile', back_populates='groups')
    entries = relationship('PlaylistEntry', back_populates='group')


class DiscoveryChannel(Base):
    __tablename__ = 'discovery_channels'
    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlist_profiles.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(255), nullable=False)
    stream_url = Column(String(512), nullable=False)
    origin_url = Column(String(512))
    status = Column(String(50), default='live')
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    playlist = relationship('PlaylistProfile', back_populates='discovery_items')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'stream_url': self.stream_url,
            'origin_url': self.origin_url,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class PlaylistEntry(Base):
    __tablename__ = 'playlist_entries'

    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey('playlist_profiles.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    group_id = Column(Integer, ForeignKey('playlist_groups.id'))
    custom_group = Column(String(255))
    order_index = Column(Integer, default=0)

    # Relationships
    playlist = relationship('PlaylistProfile', back_populates='entries')
    channel = relationship('Channel')
    group = relationship('PlaylistGroup', back_populates='entries')

