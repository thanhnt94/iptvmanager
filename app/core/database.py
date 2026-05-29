"""
database.py — Standalone SQLAlchemy Database Engine (No Flask)

This replaces both `database.py` (Flask-SQLAlchemy) and `fastapi_database.py`.
All services and routers should import from here.
"""
import os
import logging
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session, DeclarativeBase

from app.core.config import Config

logger = logging.getLogger('iptv')


# --- Declarative Base ---
class Base(DeclarativeBase):
    pass


# --- Engine Setup ---
_connect_args = {}
if Config.SQLALCHEMY_DATABASE_URI.startswith('sqlite'):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    Config.SQLALCHEMY_DATABASE_URI,
    connect_args=_connect_args,
    pool_pre_ping=True,
    echo=False,
)

# SQLite performance pragmas
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()
    except Exception:
        pass  # Not all backends support these


# --- Session Factory ---
SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Scoped session for thread safety (used by background tasks and services)
ScopedSession = scoped_session(SessionFactory)


def get_db():
    """
    FastAPI dependency that yields a DB session per request.
    Ensures proper cleanup after each request.
    """
    db = SessionFactory()
    try:
        yield db
    finally:
        db.close()


def get_scoped_session():
    """
    Returns a scoped session for use in background threads (Celery, APScheduler).
    Caller MUST call ScopedSession.remove() when done.
    """
    return ScopedSession()


def init_db():
    """Creates all tables. Call once at startup."""
    # Import all models so they register with Base.metadata
    from app.modules.auth import models as _auth_models          # noqa: F401
    from app.modules.channels import models as _channel_models    # noqa: F401
    from app.modules.playlists import models as _playlist_models  # noqa: F401
    from app.modules.health import models as _health_models       # noqa: F401
    from app.modules.settings import models as _settings_models   # noqa: F401
    from app.modules.watchtogether import models as _wt_models     # noqa: F401

    # Ensure database directory exists
    if Config.DB_PATH:
        db_dir = os.path.dirname(Config.DB_PATH)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

    Base.metadata.create_all(bind=engine)
    logger.info("Database schema verified/created successfully.")

