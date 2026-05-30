from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from app.core.database import get_db
from app.modules.livetv import models, schemas
from app.core.auth_deps import get_current_user
from app.modules.auth.models import User

router = APIRouter()

@router.get("/channels", response_model=List[schemas.TVChannelResponse])
def get_channels(db: Session = Depends(get_db)):
    """List all active TV channels with their programs."""
    return db.query(models.TVChannel).filter(models.TVChannel.is_active == True).all()

@router.get("/channels/{slug}/stream")
def stream_channel(slug: str, db: Session = Depends(get_db)):
    """Redirects to the actual video URL of the currently playing program.
    This allows users to play the channel in external IPTV players or Smart TVs."""
    current_data = get_current_program(slug=slug, db=db)
    prog = current_data.get("program")
    if prog and prog.video_url:
        return RedirectResponse(url=prog.video_url, status_code=302)
    raise HTTPException(status_code=404, detail="No program is currently playing on this channel")

@router.get("/channels/{slug}/current", response_model=schemas.TVCurrentProgramResponse)
def get_current_program(slug: str, db: Session = Depends(get_db)):
    """Core logic: Calculate what is playing RIGHT NOW based on server time."""
    channel = db.query(models.TVChannel).filter(models.TVChannel.slug == slug, models.TVChannel.is_active == True).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    now = datetime.now(timezone.utc)
    current_program = None
    seek_time = 0.0
    upcoming = []

    if channel.type == 'loop':
        programs = db.query(models.TVProgram).filter(models.TVProgram.channel_id == channel.id).order_by(models.TVProgram.order_index).all()
        if not programs:
            return {"channel_id": channel.id, "channel_name": channel.name, "channel_type": channel.type, "program": None, "seek_time": 0, "upcoming": []}
            
        total_duration = sum(p.duration_seconds for p in programs)
        if total_duration == 0:
            return {"channel_id": channel.id, "channel_name": channel.name, "channel_type": channel.type, "program": None, "seek_time": 0, "upcoming": []}

        # Ensure epoch is aware
        epoch = channel.epoch_time
        if epoch.tzinfo is None:
            epoch = epoch.replace(tzinfo=timezone.utc)
            
        elapsed = (now - epoch).total_seconds()
        
        # If epoch is in the future, we haven't started yet
        if elapsed < 0:
            return {"channel_id": channel.id, "channel_name": channel.name, "channel_type": channel.type, "program": None, "seek_time": 0, "upcoming": programs}

        current_pos = elapsed % total_duration
        accumulated = 0
        
        found_idx = -1
        for i, p in enumerate(programs):
            if accumulated <= current_pos < accumulated + p.duration_seconds:
                current_program = p
                seek_time = current_pos - accumulated
                found_idx = i
                break
            accumulated += p.duration_seconds
            
        if current_program:
            # Add next 3 upcoming programs (circular)
            for i in range(1, min(4, len(programs))):
                upcoming.append(programs[(found_idx + i) % len(programs)])
            
            # If it's a relay live stream, we don't seek
            if current_program.is_live_stream:
                seek_time = 0

    elif channel.type == 'schedule':
        # Get all programs starting today or playing now
        programs = db.query(models.TVProgram).filter(
            models.TVProgram.channel_id == channel.id,
            models.TVProgram.start_time.isnot(None)
        ).order_by(models.TVProgram.start_time).all()
        
        for p in programs:
            start = p.start_time
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
                
            start_ts = start.timestamp()
            end_ts = start_ts + p.duration_seconds
            now_ts = now.timestamp()
            
            if start_ts <= now_ts < end_ts:
                current_program = p
                seek_time = now_ts - start_ts
                if current_program.is_live_stream:
                    seek_time = 0
            elif now_ts < start_ts and len(upcoming) < 5:
                upcoming.append(p)
                
    return {
        "channel_id": channel.id,
        "channel_name": channel.name,
        "channel_type": channel.type,
        "logo": channel.logo,
        "show_watermark": channel.show_watermark,
        "program": current_program,
        "seek_time": seek_time,
        "upcoming": upcoming
    }

# --- Admin APIs for CRUD ---

@router.get("/my", response_model=List[schemas.TVChannelResponse])
def get_my_channels(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List channels owned by the current user."""
    if user.role not in ['admin', 'vip']:
        raise HTTPException(status_code=403, detail="Forbidden. Only Admin or VIP can manage channels.")
    if user.role == 'admin':
        return db.query(models.TVChannel).all()
    return db.query(models.TVChannel).filter(models.TVChannel.owner_id == user.id).all()

@router.post("/channels", response_model=schemas.TVChannelResponse)
def create_channel(channel: schemas.TVChannelCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ['admin', 'vip']:
        raise HTTPException(status_code=403, detail="Forbidden. Only Admin or VIP can create channels.")
    
    db_channel = models.TVChannel(**channel.dict(), owner_id=user.id)
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)
    return db_channel

@router.post("/programs", response_model=schemas.TVProgramResponse)
def create_program(program: schemas.TVProgramCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ['admin', 'vip']:
        raise HTTPException(status_code=403, detail="Forbidden")
    db_prog = models.TVProgram(**program.dict())
    db.add(db_prog)
    db.commit()
    db.refresh(db_prog)
    return db_prog

@router.put("/channels/{channel_id}", response_model=schemas.TVChannelResponse)
def update_channel(channel_id: int, channel: schemas.TVChannelCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db_channel = db.query(models.TVChannel).filter(models.TVChannel.id == channel_id).first()
    if not db_channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    if user.role != 'admin' and db_channel.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not your channel")
        
    for key, value in channel.dict().items():
        setattr(db_channel, key, value)
        
    db.commit()
    db.refresh(db_channel)
    return db_channel

@router.put("/channels/{channel_id}/programs/bulk")
def bulk_update_programs(channel_id: int, payload: schemas.BulkProgramsUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ['admin', 'vip']:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    channel = db.query(models.TVChannel).filter_by(id=channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
        
    if user.role != 'admin' and channel.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not your channel")

    # Delete old
    db.query(models.TVProgram).filter(models.TVProgram.channel_id == channel_id).delete()
    
    # Add new
    for prog in payload.programs:
        db.add(models.TVProgram(**prog.dict()))
        
    db.commit()
    return {"status": "ok"}

