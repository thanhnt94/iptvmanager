import os

# Absolute path to the IPTV root directory (c:\Code\Ecosystem\IPTV)
# We go up 2 levels from app/core/config.py to reach IPTV/
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
print(f" [DEBUG] Config basedir: {basedir}")
instance_path = os.path.join(basedir, 'instance')

class Config:
    SECRET_KEY = 'dev-key-12345'
    
    # Centralized SQLite database for Ecosystem (Cross-platform path)
    # We expect Storage to be NEXT to IPTV folder or inside it. 
    # Let's assume it's next to IPTV (c:\Code\Ecosystem\Storage)
    ECOSYSTEM_ROOT = os.path.abspath(os.path.join(basedir, '..'))
    DB_PATH = os.path.abspath(os.path.join(ECOSYSTEM_ROOT, 'Storage', 'database', 'IPTVManager.db'))
    # Print DB_PATH to verify across processes
    print(f" [DEBUG] SQLALCHEMY_DATABASE_URI: sqlite:///{DB_PATH}")
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_PATH}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Celery configuration (Unique filenames to avoid cross-app conflicts)
    CELERY_BROKER_URL = 'sqla+sqlite:///' + os.path.abspath(os.path.join(ECOSYSTEM_ROOT, 'Storage', 'database', 'iptv_manager_unique_broker.db'))
    CELERY_RESULT_BACKEND = 'db+sqlite:///' + os.path.abspath(os.path.join(ECOSYSTEM_ROOT, 'Storage', 'database', 'iptv_manager_unique_results.db'))
    # Print Celery Config to verify
    print(f" [DEBUG] CELERY_BROKER_URL: {CELERY_BROKER_URL}")
    
    # Session Configuration
    SESSION_TYPE = 'sqlalchemy'
    SESSION_SQLALCHEMY_TABLE = 'sessions'
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = 30 * 24 * 60 * 60 # 30 Days
    
    # App specific
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB limit for database backups
