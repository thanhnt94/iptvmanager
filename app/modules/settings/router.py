"""
Settings Router () — FastAPI, complete migration including backup/SSO test.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth_deps import login_required, admin_required
from app.modules.auth.models import User
from app.modules.settings.services import SettingService, BackupService

router = APIRouter()


@router.get("/all")
async def get_all_settings(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    """Fetch all system settings (with defaults initialization)."""
    SettingService.init_defaults(db)
    settings = SettingService.get_all(db)
    return [{
        'key': s.key,
        'value': s.value,
        'description': s.description,
        'type': s.type,
    } for s in settings]


@router.post("/toggle")
async def toggle_setting(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    key = data.get('key')
    value = data.get('value')
    if key and value is not None:
        SettingService.set(db, key, 'true' if value else 'false', type='bool')
        return {"status": "ok"}
    raise HTTPException(status_code=400, detail="Key and value required")


@router.post("/save_val")
async def save_setting_val(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    key = data.get('key')
    value = data.get('value')
    s_type = data.get('type', 'string')
    if key and value is not None:
        SettingService.set(db, key, value, type=s_type)
        return {"status": "ok"}
    raise HTTPException(status_code=400, detail="Key and value required")


@router.post("/admin/save")
async def save_settings(
    data: dict = Body(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    """Save all settings from the admin form."""
    # Boolean toggles
    for key in ['ENABLE_TS_PROXY', 'ENABLE_HLS_PROXY', 'ENABLE_PROXY_STATS',
                'ENABLE_STREAM_MANAGER', 'ENABLE_AUTO_SCAN', 'ENABLE_HEALTH_SYSTEM',
                'ENABLE_PASSIVE_CHECK', 'ENABLE_FFPROBE_DETAIL']:
        SettingService.set(db, key, 'true' if data.get(key) else 'false', type='bool')

    # Integer values
    for key in ['AUTO_SCAN_INTERVAL', 'SCAN_DELAY_SECONDS', 'HEARTBEAT_TTL_MINUTES',
                'TS_BUFFER_SIZE', 'HLS_CACHE_TTL', 'HLS_MAX_SEGMENTS']:
        if key in data:
            SettingService.set(db, key, data[key], type='int')

    # String values
    if 'CUSTOM_USER_AGENT' in data:
        SettingService.set(db, 'CUSTOM_USER_AGENT', data['CUSTOM_USER_AGENT'])

    # SSO settings
    SettingService.set(db, 'USE_CENTRAL_AUTH', 'true' if data.get('USE_CENTRAL_AUTH') else 'false', type='bool')

    if data.get('CENTRAL_AUTH_URL'):
        url = data['CENTRAL_AUTH_URL'].rstrip('/')
        SettingService.set(db, 'CENTRAL_AUTH_API_URL', url)
        SettingService.set(db, 'CENTRAL_SSO_WEB_URL', url)
    else:
        if data.get('CENTRAL_AUTH_API_URL'):
            SettingService.set(db, 'CENTRAL_AUTH_API_URL', data['CENTRAL_AUTH_API_URL'])
        if data.get('CENTRAL_SSO_WEB_URL'):
            SettingService.set(db, 'CENTRAL_SSO_WEB_URL', data['CENTRAL_SSO_WEB_URL'])

    if data.get('CENTRAL_AUTH_CLIENT_ID'):
        SettingService.set(db, 'CENTRAL_AUTH_CLIENT_ID', data['CENTRAL_AUTH_CLIENT_ID'])
    if data.get('CENTRAL_AUTH_CLIENT_SECRET'):
        SettingService.set(db, 'CENTRAL_AUTH_CLIENT_SECRET', data['CENTRAL_AUTH_CLIENT_SECRET'])

    return {"status": "ok", "message": "Settings saved successfully"}


@router.post("/admin/test-sso")
async def test_sso_connection(
    data: dict = Body(...),
    user: User = Depends(admin_required),
):
    api_url = data.get('api_url')
    client_id = data.get('client_id')
    client_secret = data.get('client_secret')

    if not api_url:
        raise HTTPException(status_code=400, detail="API URL is required")

    from app.core.sso.central_auth_client import CentralAuthClient
    test_client = CentralAuthClient(api_url=api_url, client_id=client_id, client_secret=client_secret)

    if test_client.check_health():
        return {"status": "success", "message": "Successfully connected to CentralAuth!"}
    return {"status": "error", "message": "Could not reach CentralAuth. Check URL and Network."}


@router.get("/backup/export")
async def export_backup(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    json_data = BackupService.export_database(db)
    filename = f"iptv_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return FastAPIResponse(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/backup/import")
async def import_backup(
    backup_file: UploadFile = File(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    if not backup_file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file .json!")
    try:
        content = await backup_file.read()
        json_data = content.decode('utf-8')
        success, msg = BackupService.import_database(db, json_data)
        return {"success": success, "message": msg}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi đọc file: {str(e)}")
