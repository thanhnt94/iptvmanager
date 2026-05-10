import os
import shutil
import logging
import uvicorn
from datetime import datetime
from fastapi import FastAPI, Request, Response, HTTPException, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import Config
from app.core.fastapi_database import get_db, engine
from app.core.fastapi_bridge import get_current_user, login_required
from app.core.shared import flask_app

# Initialize Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('iptv-fastapi')

app = FastAPI(
    title="IPTV Manager (FastAPI)",
    description="High-performance IPTV Task Engine & Proxy",
    version="2.0.0"
)

# CORS configuration
app.add_middleware( CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Determine static folder (Vite build output)
base_dir = os.path.dirname(os.path.abspath(__file__))
static_folder = os.path.join(base_dir, 'app', 'static', 'dist')
logger.info(f" [SYSTEM] Static folder: {static_folder}")

# --- PLAYLIST ROUTES (CRITICAL PERFORMANCE) ---

@app.get("/{username}/{slug}")
@app.get("/p/{username}/{slug}")
@app.get("/{username}/{slug}.m3u8")
@app.get("/p/{username}/{slug}.m3u8")
async def global_playlist(
    username: str, 
    slug: str, 
    request: Request,
    arg1: str = None, 
    arg2: str = None
):
    """The ULTIMATE simple route: Intelligent segment parsing (FastAPI version)."""
    # GUARD: Prevent hijacking system paths
    if username in ['assets', 'static', 'api', 'favicon.ico', 'logout', 'play', 'track', 'auth', 'auth-center', 'settings', 'ingestion', 'health']:
        raise HTTPException(status_code=404)

    with flask_app.app_context():
        from app.modules.auth.models import User
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.playlists.services import PlaylistService

        user = User.query.filter_by(username=username).first()
        if not user:
            raise HTTPException(status_code=404)

        clean_slug = slug.replace('.m3u8', '')
        actual_slug = clean_slug
        if clean_slug.lower() == 'all':
            actual_slug = f"user-{user.id}-all"
        elif clean_slug.lower() == 'protected':
            actual_slug = f"user-{user.id}-protected"

        profile = PlaylistProfile.query.filter_by(slug=actual_slug, owner_id=user.id).first()
        if not profile:
            raise HTTPException(status_code=404)

        # Mode & Status Parsing
        mode = 'smart'
        hide_die = False
        for arg in [arg1, arg2]:
            if not arg: continue
            arg_low = arg.lower()
            if arg_low in ['tracking', 'track']: mode = 'tracking'
            elif arg_low == 'direct': mode = 'direct'
            elif arg_low == 'smart': mode = 'smart'
            elif arg_low == 'live': hide_die = True
            elif arg_low == 'all': hide_die = False

        # Auto-generate EPG URL
        base_url = str(request.base_url).rstrip('/')
        xml_url = f"{base_url}/{username}/{clean_slug}.xml"
        
        if slug.endswith('.xml'):
            return Response(PlaylistService.generate_xmltv(profile.id), media_type='text/xml')

        logger.info(f" [PRIORITY-HIT] Serving M3U: {username}/{slug} | Mode: {mode} | Live: {hide_die}")
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, hide_die=hide_die, mode=mode)
        return Response(m3u_content, media_type='text/plain')

# --- API ROUTERS ---

from app.modules.settings.router import router as settings_router
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])

@app.get("/api/health")
async def api_health():
    return {"status": "online", "service": "iptv-manager-fastapi", "timestamp": datetime.now().isoformat()}

# --- STATIC FILES & SPA ---

@app.get("/assets/{path:path}")
async def serve_assets(path: str):
    file_path = os.path.join(static_folder, 'assets', path)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404)

@app.get("/")
async def read_index():
    index_file = os.path.join(static_folder, 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("Frontend build not found. Run 'npm run build' in iptv-studio.", status_code=404)

# Catch-all for SPA
@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    # Skip if it looks like an API or static file
    if full_path.startswith(("api/", "assets/", "static/")):
        return JSONResponse({"error": "Not Found"}, status_code=404)
        
    index_file = os.path.join(static_folder, 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404)

if __name__ == "__main__":
    uvicorn.run("main_fastapi:app", host="0.0.0.0", port=5030, reload=True)

