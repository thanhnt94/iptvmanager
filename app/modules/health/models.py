"""
Health Models () — Standalone SQLAlchemy, no Flask dependency.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import Session, relationship

from app.core.database import Base


class ScannerStatus(Base):
    __tablename__ = 'health_scanner_status'

    id = Column(Integer, primary_key=True)
    is_running = Column(Boolean, default=False)

    # Progress
    total = Column(Integer, default=0)
    current = Column(Integer, default=0)
    current_name = Column(String(255), nullable=True)
    current_id = Column(Integer, nullable=True)

    # Stats
    live_count = Column(Integer, default=0)
    die_count = Column(Integer, default=0)
    unknown_count = Column(Integer, default=0)

    # Config
    mode = Column(String(50), default='all')
    group = Column(String(100), default='all')
    playlist_id = Column(Integer, nullable=True)

    # Control
    stop_requested = Column(Boolean, default=False)

    # Logs
    logs_json = Column(Text, default='[]')

    last_updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @classmethod
    def get_singleton(cls, db: Session) -> "ScannerStatus":
        """Ensures we only have one scanner status record."""
        status = db.query(cls).first()
        if not status:
            try:
                status = cls(is_running=False)
                db.add(status)
                db.commit()
            except Exception:
                db.rollback()
                status = db.query(cls).first()
        return status


class ScanQueue(Base):
    __tablename__ = 'scan_queue'

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey('channels.id', ondelete='CASCADE'), nullable=False)
    status = Column(String(50), default='pending')  # pending, processing, success, failed
    priority = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    # Relationship
    channel = relationship('Channel', primaryjoin='ScanQueue.channel_id == Channel.id')


