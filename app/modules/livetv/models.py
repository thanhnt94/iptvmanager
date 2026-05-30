from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class TVChannel(Base):
    __tablename__ = "tv_channels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    logo = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    type = Column(String, nullable=False, default='loop') # 'loop' or 'schedule'
    show_watermark = Column(Boolean, default=True)
    epoch_time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    programs = relationship("TVProgram", back_populates="channel", cascade="all, delete")

class TVProgram(Base):
    __tablename__ = "tv_programs"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("tv_channels.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    video_url = Column(String, nullable=False)
    is_live_stream = Column(Boolean, default=False) # True if it's a live relay (no seeking)
    duration_seconds = Column(Integer, nullable=False, default=3600)
    order_index = Column(Integer, default=0) # For loop order
    start_time = Column(DateTime(timezone=True), nullable=True) # For schedule mode
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    channel = relationship("TVChannel", back_populates="programs")
