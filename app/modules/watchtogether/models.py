import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.core.database import Base

class WTRoom(Base):
    """Rooms for watching videos together."""
    __tablename__ = 'wt_rooms'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    host_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    current_video_id = Column(Text, nullable=True) # Text to support long URL/M3U8 strings
    is_playing = Column(Boolean, default=False)
    current_time = Column(Integer, default=0)
    allow_guest_control = Column(Boolean, default=False)
    password = Column(String(50), nullable=True)
    is_public = Column(Boolean, default=True)
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    host = relationship('User', foreign_keys=[host_id])


class WTMembership(Base):
    """Tracks users who are members of specific rooms."""
    __tablename__ = 'wt_memberships'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    room_id = Column(String(36), ForeignKey('wt_rooms.id', ondelete='CASCADE'), nullable=False)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class WTChatMessage(Base):
    """Chat messages within a room."""
    __tablename__ = 'wt_chat_messages'

    id = Column(Integer, primary_key=True)
    room_id = Column(String(36), ForeignKey('wt_rooms.id', ondelete='CASCADE'), nullable=False)
    username = Column(String(50), nullable=False)
    message = Column(String(1000), nullable=False)
    video_id = Column(Text, nullable=True)
    timestamp = Column(Integer, nullable=True)
    reactions = Column(String(1000), default='{}')
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class WTVideoHistory(Base):
    """History of videos played in a room."""
    __tablename__ = 'wt_video_history'

    id = Column(Integer, primary_key=True)
    room_id = Column(String(36), ForeignKey('wt_rooms.id', ondelete='CASCADE'), nullable=False)
    video_id = Column(Text, nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
