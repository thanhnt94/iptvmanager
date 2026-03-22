import os
from dotenv import load_dotenv

load_dotenv()

# Absolute path to the IPTV root directory
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
instance_path = os.path.join(basedir, 'instance')

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-12345')
    
    # Default SQLite database in the instance folder at the project root
    db_path = os.path.join(instance_path, 'iptv_manager.db')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', f'sqlite:///{db_path}')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Celery configuration
    CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
    
    # App specific
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB limit
