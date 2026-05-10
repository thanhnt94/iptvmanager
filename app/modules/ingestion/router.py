"""
Ingestion Router () — FastAPI, no Flask dependency.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth_deps import login_required
from app.modules.auth.models import User
from app.modules.ingestion.services import IngestionService

logger = logging.getLogger('iptv')

router = APIRouter()


@router.post("/parse-m3u8")
async def parse_m3u8(
    data: dict = Body(...),
    user: User = Depends(login_required),
):
    source = data.get('source')
    is_url = data.get('is_url', False)
    if not source:
        raise HTTPException(status_code=400, detail="No source provided")

    try:
        channels = IngestionService.parse_m3u8(source, is_url=is_url)
        return {'status': 'ok', 'channels': channels}
    except Exception as e:
        logger.error(f"Ingestion parse error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/commit")
async def commit_import(
    data: dict = Body(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    channels = data.get('channels', [])
    visibility = data.get('visibility', 'private')
    if not channels:
        raise HTTPException(status_code=400, detail="No channels provided")

    try:
        # Import channels using  logic
        from app.modules.ingestion.services import IngestionService
        result = IngestionService.import_channels(db, channels, user_id=user.id, visibility=visibility)
        return {'status': 'ok', 'added_count': result['imported'], **result}
    except Exception as e:
        logger.error(f"Ingestion commit error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/excel")
async def export_excel(
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    from app.modules.ingestion.data_services import DataExportService
    from fastapi.responses import StreamingResponse
    import io

    buffer = DataExportService.export_to_excel(db, user)
    return StreamingResponse(
        io.BytesIO(buffer.getvalue()) if hasattr(buffer, 'getvalue') else buffer,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": "attachment; filename=channels_export.xlsx"},
    )


@router.post("/import/excel")
async def import_excel(
    excel_file: UploadFile = File(...),
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    from app.modules.ingestion.data_services import DataImportService
    visibility = 'private'  # Default
    result = DataImportService.import_from_excel(excel_file.file, visibility=visibility)
    return {'status': 'ok', 'result': result}

