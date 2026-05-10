"""
Health Router () — FastAPI, no Flask dependency.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth_deps import login_required, admin_required
from app.modules.auth.models import User
from app.modules.health.models import ScannerStatus
from app.modules.channels.models import Channel
from app.modules.playlists.models import PlaylistProfile
from app.modules.settings.services import SettingService

router = APIRouter()


def _get_scan_status(db: Session) -> dict:
    status = ScannerStatus.get_singleton(db)
    import json
    try:
        logs = json.loads(status.logs_json) if status.logs_json else []
    except:
        logs = []

    return {
        'is_running': status.is_running,
        'total': status.total,
        'current': status.current,
        'current_name': status.current_name,
        'live_count': status.live_count,
        'die_count': status.die_count,
        'unknown_count': status.unknown_count,
        'stop_requested': status.stop_requested,
        'playlist_id': status.playlist_id,
        'mode': status.mode,
        'group': status.group,
        'logs': logs,
    }


@router.get("/status")
async def get_scan_status(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    return _get_scan_status(db)


@router.post("/start")
async def start_scan(
    data: dict = Body(default={}),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    from app.modules.health.services import HealthCheckService
    mode = data.get('mode', 'all')
    days = data.get('days')
    playlist_id = data.get('playlist_id')
    group = data.get('group')
    delay = data.get('delay')

    HealthCheckService.start_background_scan(
        db, mode=mode, days=days, playlist_id=playlist_id, group=group, delay=delay
    )
    return {"status": "ok", "message": "Scan initiated"}


@router.post("/stop")
async def stop_scan(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    from app.modules.health.services import HealthCheckService
    HealthCheckService.stop_scan(db)
    return {"status": "ok", "message": "Stop request sent"}


@router.get("/options")
async def get_scan_options(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    groups = [c[0] for c in db.query(Channel.group_name).distinct().filter(Channel.group_name != None).all()]
    playlists = db.query(PlaylistProfile).filter_by(is_system=False).all()
    return {
        'groups': sorted(groups),
        'playlists': [{'id': p.id, 'name': p.name} for p in playlists],
    }


@router.post("/batch-check")
async def batch_check(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    ids = data.get('ids', [])
    fast_mode = data.get('fast_mode', False)
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    from app.modules.health.services import HealthCheckService
    results = HealthCheckService.batch_check_streams(db, ids, fast_mode=fast_mode)
    return {'status': 'ok', 'results': results}


@router.get("/admin/tasks")
async def admin_tasks(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    from app.core.task_dispatcher import TaskDispatcher
    dispatcher_info = TaskDispatcher.get_status_info()

    active = {}
    scheduled = {}
    reserved = {}

    # Thread tasks
    thread_tasks = dispatcher_info.get('thread_tasks', [])
    if thread_tasks:
        active['ThreadWorker'] = [{
            'id': t['id'],
            'name': t['name'],
            'time_start': t.get('started_at'),
            'args': [],
            'kwargs': {},
        } for t in thread_tasks]

    scanner_status = _get_scan_status(db)

    if scanner_status.get('is_running') and not any(active.values()):
        active['InternalWorker'] = [{
            'id': 'scanner-process',
            'name': f"Health Scan: {scanner_status.get('current_name') or 'Initializing'}",
            'time_start': None,
            'args': [],
            'kwargs': {'playlist_id': scanner_status.get('playlist_id')},
        }]

    return {
        "status": "ok",
        "active": active,
        "scheduled": scheduled,
        "reserved": reserved,
        "scanner": scanner_status,
        "dispatcher": dispatcher_info,
    }


@router.post("/admin/tasks/purge")
async def purge_tasks(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    from app.modules.health.services import HealthCheckService
    HealthCheckService.stop_scan(db)
    return {"status": "ok", "purged_count": 0}


@router.post("/admin/tasks/reset")
async def reset_scanner(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    db.rollback()
    state = ScannerStatus.get_singleton(db)
    state.is_running = False
    state.stop_requested = True
    state.current = 0
    state.total = 0
    db.commit()
    return {"status": "ok", "message": "Scanner engine reset successfully"}


@router.get("/admin/task-backend")
async def get_task_backend_status(
    user: User = Depends(admin_required),
):
    from app.core.task_dispatcher import TaskDispatcher
    return TaskDispatcher.get_status_info()


@router.post("/admin/task-backend")
async def set_task_backend(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    backend = data.get('backend', 'thread')
    if backend not in ('thread',):
        raise HTTPException(status_code=400, detail="Invalid backend. Use: thread")
    SettingService.set(db, 'TASK_BACKEND', backend, type='string')
    from app.core.task_dispatcher import TaskDispatcher
    TaskDispatcher.invalidate_cache()
    return {"status": "ok", "backend": backend}

