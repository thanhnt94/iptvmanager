"""
Settings Models () — Standalone SQLAlchemy, no Flask dependency.
"""
from sqlalchemy import Column, Integer, String, Text

from app.core.database import Base


class SystemSetting(Base):
    __tablename__ = 'system_settings'

    id = Column(Integer, primary_key=True)
    key = Column(String(50), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    type = Column(String(20), default='string')  # string, bool, int

