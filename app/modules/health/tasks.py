import logging
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger('iptv')

@shared_task(name='health.check_channel')
def check_channel_task(channel_id, force=False, fast_mode=False, timeout=10):
    """Celery task for a single channel health check."""
    logger.info(f" [TASK-RECEIVED] health.check_channel for ID: {channel_id}")
    from app.modules.health.services import HealthCheckService
    from app.modules.channels.models import Channel
    from app.core.database import SessionFactory
    
    db = SessionFactory()
    try:
        ch = db.query(Channel).get(channel_id)
        ch_name = ch.name if ch else f"ID:{channel_id}"
        
        result = HealthCheckService.check_stream(channel_id, force=force, fast_mode=fast_mode, timeout=timeout)
        
        status = result.get('status', 'unknown')
        latency = result.get('latency', 'N/A')
        
        if status == 'live':
            logger.info(f"[Health Check] {ch_name} is LIVE | Latency: {latency}ms")
        elif status == 'die':
            logger.warning(f"[Health Check] {ch_name} is DIE | Error: {result.get('error_message')}")
        else:
            logger.debug(f"[Health Check] {ch_name} status: {status} (Reason: {result.get('skipped') or 'N/A'})")
            
        return result
    finally:
        db.close()

@shared_task(name='health.background_scan')
def background_scan_task(mode='all', days=None, playlist_id=None, group=None, delay=None):
    """Celery task for a full or scoped background scan."""
    from app.modules.health.services import HealthCheckService
    # HealthCheckService._run_scan_logic no longer needs app_context in FastAPI
    HealthCheckService._run_scan_logic(None, mode, days, playlist_id, group, delay)

# Scheduler tasks are now handled by TaskDispatcher or separate process
# since FastAPI doesn't have a built-in global scheduler like Flask-APScheduler
# but we can keep the logic here for when called via Dispatcher
