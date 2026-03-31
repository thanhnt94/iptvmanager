import os
from dotenv import load_dotenv

load_dotenv()

# Absolute path to the IPTV root directory
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
instance_path = os.path.join(basedir, 'instance')

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-12345')
    
    # Centralized SQLite database for Ecosystem
    DB_PATH = "c:\\Code\\Ecosystem\\Storage\\database\\IPTVManager.db"
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', f'sqlite:///{DB_PATH}')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Celery configuration
    CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
    
    # Session Configuration
    SESSION_TYPE = 'sqlalchemy'
    SESSION_SQLALCHEMY_TABLE = 'sessions'
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = 30 * 24 * 60 * 60 # 30 Days
    
    # App specific
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB limit for database backups
