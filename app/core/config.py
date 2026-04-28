import os

# Absolute path to the IPTV root directory (app/core/config.py -> app/core -> app -> root)
# We use 3 levels up to reach Ecosystem root where Storage folder lives
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
print(f" [DEBUG] Config basedir: {basedir}")
instance_path = os.path.join(basedir, 'instance')

class Config:
    SECRET_KEY = 'dev-key-12345'
    
    # Centralized SQLite database for Ecosystem (Cross-platform path)
    DB_PATH = os.path.abspath(os.path.join(basedir, 'Storage', 'database', 'IPTVManager.db'))
    # Print DB_PATH to verify across processes
    print(f" [DEBUG] SQLALCHEMY_DATABASE_URI: sqlite:///{DB_PATH}")
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_PATH}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Celery configuration
    # Using SQLite as broker for zero-config 'one-click' run experience
    CELERY_BROKER_URL = 'sqla+sqlite:///' + os.path.abspath(os.path.join(basedir, 'Storage', 'database', 'IPTV_celery_broker.db'))
    CELERY_RESULT_BACKEND = 'db+sqlite:///' + os.path.abspath(os.path.join(basedir, 'Storage', 'database', 'IPTV_celery_results.db'))
    
    # Session Configuration
    SESSION_TYPE = 'sqlalchemy'
    SESSION_SQLALCHEMY_TABLE = 'sessions'
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = 30 * 24 * 60 * 60 # 30 Days
    
    # App specific
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB limit for database backups
