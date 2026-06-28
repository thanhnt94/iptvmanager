"""
Channel Models () — Standalone SQLAlchemy, no Flask dependency.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class Channel(Base):
    __tablename__ = 'channels'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(512))
    group_name = Column(String(128))
    stream_url = Column(String(512), nullable=False)
    epg_id = Column(String(128))
    status = Column(String(50), default='unknown')  # live, die, unknown
    stream_type = Column(String(20), default='unknown')  # live, vod, unknown
    stream_format = Column(String(20))  # hls, mp4, ts
    latency = Column(Float)
    quality = Column(String(50))  # excellent, good, poor
    resolution = Column(String(50))
    audio_codec = Column(String(50))
    proxy_type = Column(String(20), default='none')
    video_codec = Column(String(50))
    bitrate = Column(Integer)
    error_message = Column(Text)
    last_checked_at = Column(DateTime)
    is_original = Column(Boolean, default=False)
    is_passthrough = Column(Boolean, default=False)
    is_protected = Column(Boolean, default=False)
    is_dynamic = Column(Boolean, default=False)
    keep_original_link = Column(Boolean, default=False)
    dynamic_origin_url = Column(String(512))

    # Permission fields
    owner_id = Column(Integer, ForeignKey('users.id'))
    is_public = Column(Boolean, default=False)
    public_status = Column(String(20), default='none')

    # Relationship
    owner = relationship('User', primaryjoin='Channel.owner_id == User.id', foreign_keys=[owner_id])

    # Stats fields
    play_count = Column(Integer, default=0)
    total_watch_seconds = Column(Integer, default=0)
    total_bandwidth_mb = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Channel {self.name}>'


class EPGSource(Base):
    __tablename__ = 'epg_sources'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    url = Column(String(512), nullable=False)
    priority = Column(Integer, default=0)
    last_sync_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<EPGSource {self.name}>'


class EPGData(Base):
    __tablename__ = 'epg_data'

    id = Column(Integer, primary_key=True)
    epg_id = Column(String(128), nullable=False, index=True)
    title = Column(String(512), nullable=False)
    desc = Column(Text)
    start = Column(DateTime, nullable=False, index=True)
    stop = Column(DateTime, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey('users.id'))
    source_id = Column(Integer, ForeignKey('epg_sources.id', ondelete='CASCADE'))

    def __repr__(self):
        return f'<EPGData {self.title} @ {self.start}>'


class ChannelShare(Base):
    __tablename__ = 'channel_shares'

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey('channels.id', ondelete='CASCADE'), nullable=False)
    from_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    to_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(String(20), default='pending')
    access_level = Column(String(20), default='read')
    created_at = Column(DateTime, default=datetime.utcnow)

    channel = relationship('Channel')
    from_user = relationship('User', foreign_keys=[from_user_id])
    to_user = relationship('User', foreign_keys=[to_user_id])

