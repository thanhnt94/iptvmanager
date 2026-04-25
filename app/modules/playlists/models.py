from datetime import datetime
from app.core.database import db

class PlaylistProfile(db.Model):
    __tablename__ = 'playlist_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    slug = db.Column(db.String(255), nullable=False)
    security_token = db.Column(db.String(128), unique=True)
    allowed_ips = db.Column(db.Text) # Stored as JSON or comma-separated
    is_active = db.Column(db.Boolean, default=True)
    is_system = db.Column(db.Boolean, default=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Auto-scan settings
    auto_scan_enabled = db.Column(db.Boolean, default=False)
    auto_scan_interval = db.Column(db.Integer, default=1440) # Legacy fallback
    auto_scan_time = db.Column(db.String(5), nullable=True) # "HH:MM" format
    last_auto_scan_at = db.Column(db.DateTime)
    
    # Live Scanning Status (Persistent in DB)
    is_scanning = db.Column(db.Boolean, default=False)
    current_scanning_name = db.Column(db.String(255))
    
    # Relationship to entries
    entries = db.relationship('PlaylistEntry', backref='playlist', cascade='all, delete-orphan', order_by='PlaylistEntry.order_index')
    groups = db.relationship('PlaylistGroup', backref='playlist', cascade='all, delete-orphan')

class PlaylistGroup(db.Model):
    __tablename__ = 'playlist_groups'
    id = db.Column(db.Integer, primary_key=True)
    playlist_id = db.Column(db.Integer, db.ForeignKey('playlist_profiles.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=0)

class PlaylistEntry(db.Model):
    __tablename__ = 'playlist_entries'
    
    id = db.Column(db.Integer, primary_key=True)
    playlist_id = db.Column(db.Integer, db.ForeignKey('playlist_profiles.id'), nullable=False)
    channel_id = db.Column(db.Integer, db.ForeignKey('channels.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('playlist_groups.id'))
    custom_group = db.Column(db.String(255)) # Keep for migration/compatibility
    order_index = db.Column(db.Integer, default=0)
    
    # Relationships
    channel = db.relationship('Channel')
    group = db.relationship('PlaylistGroup', backref='entries')
