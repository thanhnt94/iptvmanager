from app.core.database import db
from datetime import datetime

class ScannerStatus(db.Model):
    __tablename__ = 'health_scanner_status'
    id = db.Column(db.Integer, primary_key=True)
    is_running = db.Column(db.Boolean, default=False)
    
    # Progress
    total = db.Column(db.Integer, default=0)
    current = db.Column(db.Integer, default=0)
    current_name = db.Column(db.String(255), nullable=True)
    current_id = db.Column(db.Integer, nullable=True)
    
    # Stats
    live_count = db.Column(db.Integer, default=0)
    die_count = db.Column(db.Integer, default=0)
    unknown_count = db.Column(db.Integer, default=0)
    
    # Config
    mode = db.Column(db.String(50), default='all')
    group = db.Column(db.String(100), default='all')
    playlist_id = db.Column(db.Integer, nullable=True)
    
    # Control
    stop_requested = db.Column(db.Boolean, default=False)
    
    # Logs (Stored as JSON string or Text)
    logs_json = db.Column(db.Text, default='[]')
    
    last_updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @classmethod
    def get_singleton(cls):
        """Ensures we only have one scanner status record. Thread-safe(ish) for SQLite."""
        status = cls.query.first()
        if not status:
            try:
                status = cls(is_running=False)
                db.session.add(status)
                db.session.commit()
            except Exception:
                db.session.rollback()
                status = cls.query.first()
        return status
