"""
Dashboard Router () — FastAPI, provides system-wide stats.
"""
import psutil
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.auth_deps import login_required
from app.modules.auth.models import User
from app.modules.channels.models import Channel
from app.modules.playlists.models import PlaylistProfile
from app.modules.health.models import ScannerStatus

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    # Channel counts
    total_channels = db.query(Channel).count()
    live_channels = db.query(Channel).filter_by(status='live').count()
    die_channels = db.query(Channel).filter_by(status='die').count()
    unknown_channels = db.query(Channel).filter(
        (Channel.status == 'unknown') | (Channel.status == None)
    ).count()
    passthrough_channels = db.query(Channel).filter_by(is_passthrough=True).count()

    # Playlist counts
    total_playlists = db.query(PlaylistProfile).count()

    # User counts
    total_users = db.query(User).count()

    # Active streams (simulated from ActiveSessionManager if imported, but let's do a simple count for now)
    from app.modules.channels.services import ActiveSessionManager
    active_streams = len(ActiveSessionManager.get_active_sessions())

    # Server resources
    cpu_usage = psutil.cpu_percent()
    ram_usage = psutil.virtual_memory().percent

    # Scanner status
    scanner = ScannerStatus.get_singleton(db)
    
    return {
        'channels': {
            'total': total_channels,
            'live': live_channels,
            'die': die_channels,
            'unknown': unknown_channels,
            'passthrough': passthrough_channels,
        },
        'playlists': {
            'total': total_playlists,
        },
        'users': {
            'total': total_users,
        },
        'active_streams': active_streams,
        'server': {
            'cpu': cpu_usage,
            'ram': ram_usage,
        },
        'scan': {
            'is_scanning': scanner.is_running,
            'progress': (scanner.current / scanner.total * 100) if scanner.total > 0 else 0,
            'current': scanner.current_name or '',
            'total': scanner.total,
        }
    }
