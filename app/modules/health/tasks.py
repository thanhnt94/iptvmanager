from flask_apscheduler import APScheduler
from celery import shared_task
import logging

logger = logging.getLogger('iptv')
scheduler = APScheduler()

@shared_task(name='health.check_channel')
def check_channel_task(channel_id, force=False, fast_mode=False):
    """Celery task for a single channel health check."""
    from app.modules.health.services import HealthCheckService
    from app.modules.channels.models import Channel
    
    ch = Channel.query.get(channel_id)
    ch_name = ch.name if ch else f"ID:{channel_id}"
    
    result = HealthCheckService.check_stream(channel_id, force=force, fast_mode=fast_mode)
    
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
    from app.modules.health.services import HealthCheckService
    from flask import current_app
    HealthCheckService._run_scan_logic(current_app, mode, days, playlist_id, group, delay)

def init_scheduler(app):
    """
    Initializes the scheduler for tasks like EPG sync and Auto-Scan.
    """
    scheduler.init_app(app)
    scheduler.start()

@scheduler.task('interval', id='auto_scan_playlists', minutes=5)
def auto_scan_playlists_task():
    """
    Periodic task to trigger health checks for playlists with auto-scan enabled.
    Evaluates based on user-defined specific time of day (in UTC+7) rather than intervals.
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

        # 2. Get current time in UTC+7
        tz_utc7 = timezone(timedelta(hours=7))
        now_utc7 = datetime.now(tz_utc7)
        now_utc = datetime.utcnow()
        
        # Find all playlists with auto-scan enabled
        playlists = PlaylistProfile.query.filter_by(auto_scan_enabled=True).all()
        
        for p in playlists:
            should_run = False
            
            # If no time is configured, fallback to default "00:00" behavior or skip
            scan_time_str = p.auto_scan_time or "00:00"
            
            try:
                scan_hour, scan_minute = map(int, scan_time_str.split(':'))
                scan_time_today = now_utc7.replace(hour=scan_hour, minute=scan_minute, second=0, microsecond=0)
                
                # Check if current time has passed the scheduled scan time today
                if now_utc7 >= scan_time_today:
                    if not p.last_auto_scan_at:
                        should_run = True
                    else:
                        # Convert last scan time (UTC) to UTC+7 to compare dates
                        last_scan_utc = p.last_auto_scan_at.replace(tzinfo=timezone.utc)
                        last_scan_utc7 = last_scan_utc.astimezone(tz_utc7)
                        
                        # If we haven't scanned today in UTC+7, we should run
                        if last_scan_utc7.date() < now_utc7.date():
                            should_run = True
            except Exception as e:
                logger.error(f"Error parsing auto_scan_time for playlist {p.id}: {e}")
                continue
            
            if should_run:
                logger.info(f" [AUTO-SCAN] Triggering scheduled check for playlist: {p.name} (#{p.id}) at {scan_time_str} UTC+7")
                
                # Update last_scan timestamp BEFORE starting to prevent double trigger on next 5m tick
                p.last_auto_scan_at = now_utc
                db.session.commit()
                
                # Start background scan (this spawns a thread)
                HealthCheckService.start_background_scan(
                    scheduler.app,
                    mode='all',
                    playlist_id=p.id
                )
                # Since the global scanner handles one at a time, we break after starting the first due playlist
                break
