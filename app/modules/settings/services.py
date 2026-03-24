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
