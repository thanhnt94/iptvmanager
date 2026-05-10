"""
Health Models () — Standalone SQLAlchemy, no Flask dependency.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.orm import Session

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

