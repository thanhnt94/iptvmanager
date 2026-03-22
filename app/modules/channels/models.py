from datetime import datetime
from app.core.database import db

class Channel(db.Model):
    __tablename__ = 'channels'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    logo_url = db.Column(db.String(512))
    group_name = db.Column(db.String(128))
    stream_url = db.Column(db.String(512), unique=True, nullable=False)
    epg_id = db.Column(db.String(128))
    status = db.Column(db.String(50), default='unknown') # live, die, unknown
    stream_type = db.Column(db.String(20), default='unknown') # live, vod, unknown
    latency = db.Column(db.Float) # Response time in ms
    quality = db.Column(db.String(50)) # excellent, good, poor
    resolution = db.Column(db.String(50)) # e.g., 1920x1080
    audio_codec = db.Column(db.String(50)) # e.g., aac, ac3
    last_checked_at = db.Column(db.DateTime)
    
    # Stats fields
    play_count = db.Column(db.Integer, default=0)
    total_watch_seconds = db.Column(db.Integer, default=0)
    total_bandwidth_mb = db.Column(db.Float, default=0.0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Channel {self.name}>'

class EPGSource(db.Model):
    __tablename__ = 'epg_sources'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(512), nullable=False)
    last_sync_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<EPGSource {self.name}>'

class EPGData(db.Model):
    __tablename__ = 'epg_data'
    
    id = db.Column(db.Integer, primary_key=True)
    epg_id = db.Column(db.String(128), nullable=False, index=True)
    title = db.Column(db.String(512), nullable=False)
    desc = db.Column(db.Text)
    start = db.Column(db.DateTime, nullable=False, index=True)
    stop = db.Column(db.DateTime, nullable=False, index=True)
    
    def __repr__(self):
        return f'<EPGData {self.title} @ {self.start}>'
