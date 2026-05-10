"""
EPG Router () — FastAPI, no Flask dependency.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth_deps import login_required, admin_required
from app.modules.auth.models import User
from app.modules.channels.models import EPGSource, EPGData, Channel

router = APIRouter()


@router.get("/sources")
async def list_sources(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    sources = db.query(EPGSource).all()
    return [{
        'id': s.id,
        'name': s.name,
        'url': s.url,
        'priority': s.priority,
        'last_sync': s.last_sync_at.strftime('%Y-%m-%d %H:%M:%S') if s.last_sync_at else 'Never',
    } for s in sources]


@router.get("/hints")
async def get_epg_hints(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    ids = db.query(EPGData.epg_id).distinct().all()
    return [i[0] for i in ids if i[0]]


@router.post("/sources")
async def add_source(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    name = data.get('name')
    url = data.get('url')
    if not name or not url:
        raise HTTPException(status_code=400, detail="Name and URL are required")
    source = EPGSource(name=name, url=url)
    db.add(source)
    db.commit()
    return {'status': 'ok', 'id': source.id}


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: int,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    source = db.query(EPGSource).get(source_id)
    if source:
        db.delete(source)
        db.commit()
        return {'status': 'ok'}
    raise HTTPException(status_code=404, detail="Source not found")


@router.post("/sources/{source_id}/sync")
async def sync_source(
    source_id: int,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    from app.modules.channels.services import EPGService
    result = EPGService.sync_epg(source_id)
    return result


@router.get("/programs")
async def list_programs(
    date: str = None,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    try:
        start_look = datetime.strptime(date, '%Y-%m-%d') if date else datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    except Exception:
        start_look = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    end_look = start_look + timedelta(days=1, hours=6)

    programs = db.query(EPGData).filter(
        EPGData.start >= start_look,
        EPGData.start <= end_look,
    ).all()

    sources = {s.id: s.priority for s in db.query(EPGSource).all()}

    return [{
        'id': p.id,
        'epg_id': p.epg_id,
        'title': p.title,
        'desc': p.desc,
        'start': p.start.isoformat(),
        'stop': p.stop.isoformat(),
        'is_manual': p.owner_id is not None,
        'priority': 10000 if p.owner_id else sources.get(p.source_id, 0),
    } for p in programs]


@router.post("/programs")
async def add_program(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    epg_id = data.get('epg_id')
    title = data.get('title')
    start_str = data.get('start')
    stop_str = data.get('stop')
    desc = data.get('desc')

    if not all([epg_id, title, start_str, stop_str]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        start_dt = datetime.strptime(start_str, '%Y-%m-%dT%H:%M')
        stop_dt = datetime.strptime(stop_str, '%Y-%m-%dT%H:%M')
    except Exception:
        try:
            start_dt = datetime.strptime(start_str, '%Y-%m-%d %H:%M:%S')
            stop_dt = datetime.strptime(stop_str, '%Y-%m-%d %H:%M:%S')
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date format")

    prog = EPGData(epg_id=epg_id, title=title, start=start_dt, stop=stop_dt, desc=desc, owner_id=user.id)
    db.add(prog)
    db.commit()
    return {'status': 'ok', 'id': prog.id}


@router.delete("/programs/{prog_id}")
async def delete_program(
    prog_id: int,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    prog = db.query(EPGData).get(prog_id)
    if not prog or prog.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized or Not Found")
    db.delete(prog)
    db.commit()
    return {'status': 'ok'}


@router.get("/now-next/{epg_id:path}")
async def get_now_next(
    epg_id: str,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    current = db.query(EPGData).filter(
        EPGData.epg_id == epg_id,
        EPGData.start <= now,
        EPGData.stop >= now,
    ).first()
    next_prog = db.query(EPGData).filter(
        EPGData.epg_id == epg_id,
        EPGData.start > now,
    ).order_by(EPGData.start.asc()).first()

    return {
        'current': {
            'title': current.title,
            'start': current.start.isoformat(),
            'stop': current.stop.isoformat(),
            'desc': current.desc,
        } if current else None,
        'next': {
            'title': next_prog.title,
            'start': next_prog.start.isoformat(),
            'stop': next_prog.stop.isoformat(),
            'desc': next_prog.desc,
        } if next_prog else None,
    }


@router.post("/import-file")
async def import_epg_file(
    file: UploadFile = File(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    content = (await file.read()).decode('utf-8', 'ignore')
    from app.modules.channels.services import EPGService
    result = EPGService.import_xmltv(content, user.id)
    return result


@router.post("/import-url")
async def import_epg_url(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    url = data.get('url')
    if not url:
        raise HTTPException(status_code=400, detail="No URL provided")
    from app.modules.channels.services import EPGService
    result = EPGService.import_xmltv_from_url(url, user.id)
    return result

