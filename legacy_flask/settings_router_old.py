from fastapi import APIRouter, Depends, HTTPException, Request, Body
from fastapi.responses import JSONResponse
from app.core.fastapi_bridge import admin_required
from .services import SettingService
import logging

logger = logging.getLogger('iptv-fastapi')
router = APIRouter()

@router.get("/all")
async def get_all_settings(user=Depends(admin_required)):
    """Fetch all system settings."""
    settings = SettingService.get_all()
    return [{
        'key': s.key,
        'value': s.value,
        'description': s.description,
        'type': s.type
    } for s in settings]

@router.post("/toggle")
async def toggle_setting(
    data: dict = Body(...),
    user=Depends(admin_required)
):
    """Toggle a boolean setting."""
    key = data.get('key')
    value = data.get('value')
    if key and value is not None:
        SettingService.set(key, 'true' if value else 'false', type='bool')
        return {"status": "ok"}
    raise HTTPException(status_code=400, detail="Key and value required")

@router.post("/save_val")
async def save_setting_val(
    data: dict = Body(...),
    user=Depends(admin_required)
):
    """Save a specific setting value."""
    key = data.get('key')
    value = data.get('value')
    s_type = data.get('type', 'string')
    
    if key and value is not None:
        SettingService.set(key, value, type=s_type)
        return {"status": "ok"}
    raise HTTPException(status_code=400, detail="Key and value required")

