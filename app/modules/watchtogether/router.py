import logging
from fastapi import APIRouter, Depends, HTTPException, Body, status, Request
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.auth_deps import login_required, get_current_user
from app.modules.auth.models import User
from app.modules.watchtogether.models import WTRoom, WTMembership, WTChatMessage, WTVideoHistory

logger = logging.getLogger('iptv')
router = APIRouter()

@router.get("/rooms")
async def list_rooms(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List public rooms and rooms owned by the current user."""
    public_rooms = db.query(WTRoom).filter_by(is_public=True).order_by(WTRoom.last_updated.desc()).all()
    
    my_rooms = []
    if user:
        my_rooms = db.query(WTRoom).filter_by(host_id=user.id).all()
        
    def serialize_room(r: WTRoom):
        # Fetch host username
        host_user = db.query(User).filter_by(id=r.host_id).first()
        return {
            "id": r.id,
            "name": r.name,
            "host_id": r.host_id,
            "host_username": host_user.username if host_user else "Unknown",
            "current_video_id": r.current_video_id,
            "is_playing": r.is_playing,
            "current_time": r.current_time,
            "allow_guest_control": r.allow_guest_control,
            "is_public": r.is_public,
            "has_password": bool(r.password)
        }

    return {
        "public_rooms": [serialize_room(r) for r in public_rooms],
        "my_rooms": [serialize_room(r) for r in my_rooms]
    }

@router.post("/rooms")
async def create_room(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db)
):
    """Create a new watchtogether room."""
    name = data.get('name', f"Phòng của {user.username}")
    is_public = data.get('is_public', True)
    password = data.get('password') or None
    allow_guest_control = data.get('allow_guest_control', False)

    new_room = WTRoom(
        name=name,
        host_id=user.id,
        is_public=is_public,
        password=password,
        allow_guest_control=allow_guest_control
    )

    try:
        db.add(new_room)
        db.commit()
        db.refresh(new_room)
        return {
            "success": True,
            "room_id": new_room.id
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating room: {e}")
        raise HTTPException(status_code=500, detail="Cannot create room")

@router.get("/rooms/{room_id}")
async def get_room(
    room_id: str,
    pw: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detail of a specific room, check password if private."""
    room = db.query(WTRoom).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_host = (user.id == room.host_id) if user else False

    # Check password if private and not host
    if not room.is_public and not is_host:
        if room.password and pw != room.password:
            raise HTTPException(status_code=403, detail="Mật khẩu phòng không đúng")

    host_user = db.query(User).filter_by(id=room.host_id).first()

    # Smart resume: if video was playing, calculate where it should be now
    resume_time = room.current_time or 0
    if room.is_playing and room.last_updated:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        last = room.last_updated
        # Ensure last_updated is timezone-aware
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_seconds = (now - last).total_seconds()
        resume_time = int(resume_time + elapsed_seconds)

    return {
        "id": room.id,
        "name": room.name,
        "host_id": room.host_id,
        "host_username": host_user.username if host_user else "Unknown",
        "current_video_id": room.current_video_id,
        "is_playing": room.is_playing,
        "current_time": resume_time,
        "allow_guest_control": room.allow_guest_control,
        "is_public": room.is_public,
        "is_host": is_host,
        "has_password": bool(room.password)
    }

@router.post("/rooms/{room_id}/update")
async def update_room_endpoint(
    room_id: str,
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db)
):
    """Update settings of a room. Only host can do this."""
    room = db.query(WTRoom).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.host_id != user.id:
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng mới được thay đổi cài đặt")

    if 'name' in data:
        room.name = data['name']
    if 'password' in data:
        room.password = data['password'] or None
    if 'is_public' in data:
        room.is_public = data['is_public']
    if 'allow_guest_control' in data:
        room.allow_guest_control = data['allow_guest_control']

    try:
        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating room: {e}")
        raise HTTPException(status_code=500, detail="Cannot update room")

@router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: str,
    user: User = Depends(login_required),
    db: Session = Depends(get_db)
):
    """Delete a room. Only host can do this."""
    room = db.query(WTRoom).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.host_id != user.id:
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng mới được xóa phòng")

    try:
        db.query(WTMembership).filter_by(room_id=room_id).delete()
        db.query(WTChatMessage).filter_by(room_id=room_id).delete()
        db.query(WTVideoHistory).filter_by(room_id=room_id).delete()
        db.delete(room)
        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting room: {e}")
        raise HTTPException(status_code=500, detail="Cannot delete room")
