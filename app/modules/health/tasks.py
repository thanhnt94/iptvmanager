from flask_apscheduler import APScheduler
import logging

logger = logging.getLogger('iptv')
scheduler = APScheduler()

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
    """
    with scheduler.app.app_context():
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.health.services import HealthCheckService
        from datetime import datetime
        from app.core.database import db

        # 1. Check if global scanner is already busy
        status = HealthCheckService.get_status()
        if status.get('is_running'):
            logger.debug("Auto-Scan: Global scanner is busy, skipping this cycle.")
            return

        now = datetime.utcnow()
        # Find all playlists with auto-scan enabled
        playlists = PlaylistProfile.query.filter_by(auto_scan_enabled=True).all()
        
        for p in playlists:
            should_run = False
            if not p.last_auto_scan_at:
                should_run = True
            else:
                elapsed_mins = (now - p.last_auto_scan_at).total_seconds() / 60
                # Use default 1440 mins (1 day) if interval is not set
                interval = p.auto_scan_interval or 1440
                if elapsed_mins >= interval:
                    should_run = True
            
            if should_run:
                logger.info(f" [AUTO-SCAN] Triggering scheduled check for playlist: {p.name} (#{p.id})")
                
                # Update last_scan timestamp BEFORE starting to prevent double trigger on next 5m tick
                p.last_auto_scan_at = now
                db.session.commit()
                
                # Start background scan (this spawns a thread)
                HealthCheckService.start_background_scan(
                    scheduler.app,
                    mode='all',
                    playlist_id=p.id
                )
                # Since the global scanner handles one at a time, we break after starting the first due playlist
                break
