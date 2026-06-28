"""
main.py — Pure FastAPI Entry Point (No Flask)

Usage:
    uvicorn main:app --host 0.0.0.0 --port 5030 --reload
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# --- Logging Setup ---
from app.core.logging_config import setup_logging
setup_logging(None)  # No Flask app needed
logger = logging.getLogger('iptv')

# --- Lifespan (Startup/Shutdown) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    logger.info("=" * 60)
    logger.info("  IPTV Manager  — Pure FastAPI Mode")
    logger.info("=" * 60)

    # 1. Initialize Database
    from app.core.database import init_db, SessionFactory
    init_db()

    # 2. Ensure default data
    db = SessionFactory()
    try:
        from app.modules.auth.services import AuthService
        from app.modules.playlists.services import PlaylistService
        from app.modules.settings.services import SettingService

        AuthService.ensure_admin_user(db)
        PlaylistService.ensure_global_system_playlists(db)
        SettingService.init_defaults(db)
        logger.info("Database defaults initialized.")

        # 3. Start background Scan Queue worker thread
        import threading
        from app.modules.health.services import HealthCheckService
        queue_thread = threading.Thread(target=HealthCheckService.process_scan_queue_loop, daemon=True, name="ScanQueueWorker")
        queue_thread.start()
        logger.info("Scan Queue Worker thread started successfully.")
    except Exception as e:
        logger.error(f"Startup initialization error: {e}", exc_info=True)
    finally:
        db.close()

    yield  # App is running

    logger.info("IPTV Manager shutting down.")


# --- App Factory ---
app = FastAPI(
    title="IPTV Manager",
    version="2.0.0",
    description="Advanced IPTV Stream Manager — Pure FastAPI",
    lifespan=lifespan,
)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register API Routers ---
from app.modules.auth.router import router as auth_router
from app.modules.settings.router import router as settings_router
from app.modules.channels.router import router as channels_router
from app.modules.channels.epg_router import router as epg_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.playlists.router import router as playlists_router, legacy_router as playlists_legacy_router
from app.modules.health.router import router as health_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.watchtogether.router import router as watchtogether_router
from app.modules.livetv.router import router as livetv_router
import socketio
from app.modules.watchtogether.socket_events import sio

app.include_router(playlists_legacy_router, tags=["Legacy"]) # Legacy /p/ support - MUST BE FIRST
app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
app.include_router(channels_router, prefix="/api/channels", tags=["Channels"])
app.include_router(channels_router, prefix="/api/streams", tags=["Streams"]) # Added for compatibility
app.include_router(epg_router, prefix="/api/epg", tags=["EPG"])
app.include_router(playlists_router, prefix="/api/playlists", tags=["Playlists"])
app.include_router(health_router, prefix="/api/health", tags=["Health"])
app.include_router(ingestion_router, prefix="/api/ingestion", tags=["Ingestion"])
app.include_router(watchtogether_router, prefix="/api/watchtogether", tags=["WatchTogether"])
app.include_router(livetv_router, prefix="/api/livetv", tags=["LiveTV"])

# Mount Socket.IO
sio_app = socketio.ASGIApp(sio, socketio_path="")
app.mount("/watchtogether/socket.io", sio_app)

# --- Health Check ---
@app.get("/api/ping")
async def ping():
    return {"status": "ok", "engine": "fastapi", "version": "2.0.0"}

# --- SPA Serving ---
# Serve Vite build output (static assets)
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'app', 'static', 'dist')
SPA_INDEX = os.path.join(STATIC_DIR, 'index.html')

if os.path.isdir(STATIC_DIR):
    # Mount /assets separately for proper caching
    assets_dir = os.path.join(STATIC_DIR, 'assets')
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Serve other static files at root level
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/{full_path:path}")
async def spa_fallback(request: Request, full_path: str):
    """
    SPA Fallback — Serves index.html for all non-API routes.
    This enables client-side routing (React Router).
    """
    # Don't serve SPA for API routes (they should 404 naturally)
    if full_path.startswith("api/"):
        return {"detail": "Not Found"}, 404

    # Try to serve the file directly first (favicon, manifest, etc.)
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    # Fallback to SPA index
    if os.path.isfile(SPA_INDEX):
        return FileResponse(SPA_INDEX)

    return {"message": "IPTV Manager API is running. Build the frontend with: cd iptv-studio && npm run build"}

