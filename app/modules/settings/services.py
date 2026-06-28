"""
Settings Service () — Uses injected Session, no Flask dependency.
"""
import json
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from app.modules.settings.models import SystemSetting

logger = logging.getLogger('iptv')


class SettingService:
    """All methods now take an explicit `db: Session` parameter."""

    @staticmethod
    def get(db: Session, key: str, default=None):
        try:
            setting = db.query(SystemSetting).filter_by(key=key).first()
            if not setting:
                return default
            if setting.type == 'bool':
                return str(setting.value).lower() == 'true'
            if setting.type == 'int':
                return int(setting.value)
            return setting.value
        except Exception:
            return default

    @staticmethod
    def set(db: Session, key: str, value, type: str = 'string', description: str = None):
        setting = db.query(SystemSetting).filter_by(key=key).first()
        if not setting:
            setting = SystemSetting(key=key, value=str(value), type=type, description=description)
            db.add(setting)
        else:
            setting.value = str(value)
            if description:
                setting.description = description
        db.commit()
        return setting

    @staticmethod
    def get_all(db: Session):
        return db.query(SystemSetting).all()

    @staticmethod
    def init_defaults(db: Session):
        """Initialize default settings if they don't exist."""
        defaults = [
            ('ENABLE_PROXY_STATS', 'true', 'bool', 'Enable server-side proxying for TS/HLS stats.'),
            ('ENABLE_STREAM_MANAGER', 'true', 'bool', 'Enable singleton stream sharing (TVHeadend Mode).'),
            ('ENABLE_AUTO_SCAN', 'false', 'bool', 'Enable periodic background health checks.'),
            ('AUTO_SCAN_INTERVAL', '6', 'int', 'Interval in hours between full scans.'),
            ('SCAN_DELAY_SECONDS', '2', 'int', 'Delay in seconds between scanning each channel.'),
            ('ENABLE_HEALTH_SYSTEM', 'true', 'bool', 'System Diagnostics Master Switch.'),
            ('ENABLE_PASSIVE_CHECK', 'true', 'bool', 'Perform health check when a channel is accessed.'),
            ('ENABLE_FFPROBE_DETAIL', 'true', 'bool', 'Run heavy FFprobe analysis (CPU Intensive).'),
            ('HEARTBEAT_TTL_MINUTES', '30', 'int', 'Time in minutes to skip re-checking a LIVE channel.'),
            ('ENABLE_TS_PROXY', 'true', 'bool', 'Enable TVHeadend-style Proxy for MPEG-TS streams.'),
            ('ENABLE_HLS_PROXY', 'true', 'bool', 'Enable RAM Caching Proxy for HLS streams.'),
            ('TS_BUFFER_SIZE', '128', 'int', 'Number of 16KB chunks in TS RAM buffer.'),
            ('HLS_CACHE_TTL', '60', 'int', 'Seconds to keep HLS segments in RAM.'),
            ('HLS_MAX_SEGMENTS', '50', 'int', 'Max HLS segments per channel in RAM.'),
            ('TASK_BACKEND', 'thread', 'string', 'Task execution backend: thread (default).'),
            ('SOCKS5_PROXY_URL', '', 'string', 'SOCKS5 Proxy URL (e.g., socks5://user:pass@ip:port) for scanning and proxying.'),
        ]
        for key, value, s_type, desc in defaults:
            existing = db.query(SystemSetting).filter_by(key=key).first()
            if not existing:
                db.add(SystemSetting(key=key, value=value, type=s_type, description=desc))
        db.commit()


class BackupService:
    """Database export/import service."""

    @staticmethod
    def _get_models():
        from app.modules.auth.models import User, UserPlaylist, TrustedIP
        from app.modules.channels.models import Channel, EPGSource, EPGData
        from app.modules.playlists.models import PlaylistProfile, PlaylistGroup, PlaylistEntry
        from app.modules.settings.models import SystemSetting
        return {
            'users': User,
            'settings': SystemSetting,
            'trusted_ips': TrustedIP,
            'epg_sources': EPGSource,
            'epg_data': EPGData,
            'channels': Channel,
            'playlist_profiles': PlaylistProfile,
            'playlist_groups': PlaylistGroup,
            'user_playlists': UserPlaylist,
            'playlist_entries': PlaylistEntry,
        }

    class _CustomEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            return super().default(obj)

    @classmethod
    def export_database(cls, db: Session) -> str:
        models = cls._get_models()
        data = {}
        for key, model in models.items():
            records = db.query(model).all()
            table_data = []
            for record in records:
                row_dict = {}
                for column in record.__table__.columns:
                    row_dict[column.name] = getattr(record, column.name)
                table_data.append(row_dict)
            data[key] = table_data
        return json.dumps(data, cls=cls._CustomEncoder, indent=2)

    @classmethod
    def import_database(cls, db: Session, json_data: str):
        try:
            data = json.loads(json_data)
            models = cls._get_models()

            # Delete in reverse order (children first)
            for key in reversed(list(models.keys())):
                db.query(models[key]).delete()
            db.commit()

            # Insert in order (parents first)
            for key, model in models.items():
                if key in data:
                    for row_dict in data[key]:
                        for col_name, val in row_dict.items():
                            if isinstance(val, str):
                                try:
                                    row_dict[col_name] = datetime.fromisoformat(val)
                                except ValueError:
                                    pass
                        db.add(model(**row_dict))
            db.commit()
            return True, "Khôi phục dữ liệu thành công!"
        except Exception as e:
            db.rollback()
            return False, f"Lỗi khi khôi phục dữ liệu: {str(e)}"

