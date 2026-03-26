from .models import SystemSetting
from app.core.database import db

class SettingService:
    @staticmethod
    def get(key, default=None):
        try:
            setting = SystemSetting.query.filter_by(key=key).first()
            if not setting: return default
            if setting.type == 'bool':
                return str(setting.value).lower() == 'true'
            if setting.type == 'int':
                return int(setting.value)
            return setting.value
        except:
            return default

    @staticmethod
    def set(key, value, type='string', description=None):
        setting = SystemSetting.query.filter_by(key=key).first()
        if not setting:
            setting = SystemSetting(key=key, value=str(value), type=type, description=description)
            db.session.add(setting)
        else:
            setting.value = str(value)
            if description: setting.description = description
        db.session.commit()
        return setting

    @staticmethod
    def get_all():
        return SystemSetting.query.all()

import json
from datetime import datetime
from app.modules.channels.models import Channel, EPGSource, EPGData
from app.modules.playlists.models import PlaylistProfile, PlaylistGroup, PlaylistEntry
from app.modules.auth.models import User, UserPlaylist, TrustedIP
from .models import SystemSetting

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

class BackupService:
    MODELS = {
        'users': User,
        'settings': SystemSetting,
        'trusted_ips': TrustedIP,
        'epg_sources': EPGSource,
        'epg_data': EPGData,
        'channels': Channel,
        'playlist_profiles': PlaylistProfile,
        'playlist_groups': PlaylistGroup,
        'user_playlists': UserPlaylist,
        'playlist_entries': PlaylistEntry
    }

    @classmethod
    def export_database(cls):
        """Export toàn bộ DB ra dict"""
        data = {}
        for key, model in cls.MODELS.items():
            records = model.query.all()
            table_data = []
            for record in records:
                row_dict = {}
                for column in record.__table__.columns:
                    row_dict[column.name] = getattr(record, column.name)
                table_data.append(row_dict)
            data[key] = table_data
        
        return json.dumps(data, cls=CustomJSONEncoder, indent=2)

    @classmethod
    def import_database(cls, json_data):
        """Import data từ file JSON, xóa data cũ và insert data mới"""
        try:
            data = json.loads(json_data)
            
            # 1. Xóa data cũ theo thứ tự ngược lại (Con -> Cha) để tránh lỗi Foreign Key
            for key in reversed(list(cls.MODELS.keys())):
                cls.MODELS[key].query.delete()
            
            db.session.commit()

            # 2. Insert data mới theo thứ tự chuẩn (Cha -> Con)
            for key, model in cls.MODELS.items():
                if key in data:
                    for row_dict in data[key]:
                        # Xử lý parse datetime string về object datetime nếu cần
                        for col_name, val in row_dict.items():
                            if isinstance(val, str):
                                try:
                                    # Thử parse ISO format
                                    row_dict[col_name] = datetime.fromisoformat(val)
                                except ValueError:
                                    pass
                        
                        new_record = model(**row_dict)
                        db.session.add(new_record)
            
            db.session.commit()
            return True, "Khôi phục dữ liệu thành công!"
        except Exception as e:
            db.session.rollback()
            return False, f"Lỗi khi khôi phục dữ liệu: {str(e)}"
