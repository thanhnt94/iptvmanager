from flask_apscheduler import APScheduler
from celery import shared_task
import logging
from celery.utils.log import get_task_logger

logger = get_task_logger('iptv')
scheduler = APScheduler()

@shared_task(name='health.check_channel')
def check_channel_task(channel_id, force=False, fast_mode=False, timeout=10):
    """Celery task for a single channel health check."""
    from run_iptv import app
    with app.app_context():
        logger.info(f" [TASK-RECEIVED] health.check_channel for ID: {channel_id}")
        from app.modules.health.services import HealthCheckService
        from app.modules.channels.models import Channel
        
        ch = Channel.query.get(channel_id)
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

@shared_task(name='health.background_scan')
def background_scan_task(mode='all', days=None, playlist_id=None, group=None, delay=None):
    """Celery task for a full or scoped background scan."""
    from run_iptv import app
    with app.app_context():
        from app.modules.health.services import HealthCheckService
        HealthCheckService._run_scan_logic(app, mode, days, playlist_id, group, delay)

def init_scheduler(app):
    """
    Initializes the scheduler for tasks like EPG sync and Auto-Scan.
    """
    scheduler.init_app(app)
    scheduler.start()

@scheduler.task('interval', id='auto_scan_playlists', seconds=10)
def auto_scan_playlists_task():
    """
    Periodic task to trigger health checks for playlists with auto-scan enabled.
    """
    with scheduler.app.app_context():
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.health.services import HealthCheckService
        from datetime import datetime, timedelta, timezone
        from app.core.database import db

        # 1. Check if global scanner is already busy
        status = HealthCheckService.get_status()
        if status.get('is_running'):
            logger.debug("Auto-Scan: Global scanner is busy, skipping this cycle.")
            return

        tz_utc7 = timezone(timedelta(hours=7))
        now_utc7 = datetime.now(tz_utc7)
        now_utc = datetime.utcnow()
        
        playlists = PlaylistProfile.query.filter_by(auto_scan_enabled=True).all()
        
        for p in playlists:
            should_run = False
            scan_time_str = p.auto_scan_time or "00:00"
            
            try:
                scan_hour, scan_minute = map(int, scan_time_str.split(':'))
                scan_time_today = now_utc7.replace(hour=scan_hour, minute=scan_minute, second=0, microsecond=0)
                
                if now_utc7 >= scan_time_today:
                    if not p.last_auto_scan_at:
                        should_run = True
                    else:
                        last_scan_utc = p.last_auto_scan_at.replace(tzinfo=timezone.utc)
                        last_scan_utc7 = last_scan_utc.astimezone(tz_utc7)
                        if last_scan_utc7.date() < now_utc7.date():
                            should_run = True
            except Exception as e:
                logger.error(f"Error parsing auto_scan_time for playlist {p.id}: {e}")
                continue
            
            if should_run:
                logger.info(f" [AUTO-SCAN] Triggering scheduled check for playlist: {p.name} (#{p.id}) at {scan_time_str} UTC+7")
                p.last_auto_scan_at = now_utc
                db.session.commit()
                
                HealthCheckService.start_background_scan(
                    scheduler.app,
                    mode='all',
                    playlist_id=p.id
                )
                break
