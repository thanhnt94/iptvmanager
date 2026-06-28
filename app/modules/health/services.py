"""
Health Service () — Uses injected Session, no Flask dependency.
"""
import requests
import subprocess
import shutil
import json
import time
import threading
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.modules.channels.models import Channel
from app.modules.health.models import ScannerStatus
from app.core.database import SessionFactory

logger = logging.getLogger('iptv')


class HealthCheckService:
    _stop_event = threading.Event()

    @staticmethod
    def check_stream(db: Session, channel_id: int, force=False, fast_mode=False, timeout=10):
        """Checks the connectivity and technical specs of a single stream URL."""
        channel = db.query(Channel).get(channel_id)
        if not channel:
            logger.error(f" [HEALTH-ERROR] Channel ID {channel_id} not found!")
            return {}

        logger.info(f" [HEALTH-START] Checking {channel.name} (Force={force}, Fast={fast_mode}, Timeout={timeout}s)")

        from app.modules.settings.services import SettingService
        if not SettingService.get(db, 'ENABLE_HEALTH_SYSTEM', True):
            return {'status': channel.status, 'skipped': 'Master switch OFF'}

        if channel.is_passthrough:
            return {'status': 'live', 'skipped': 'Passthrough mode active'}

        # TTL check
        if not force and channel.last_checked_at:
            ttl_minutes = SettingService.get(db, 'HEARTBEAT_TTL_MINUTES', 30)
            delta = (datetime.utcnow() - channel.last_checked_at).total_seconds()
            if delta < (ttl_minutes * 60) and channel.status == 'live':
                return {'status': channel.status, 'skipped': 'TTL active'}

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': channel.stream_url,
        }

        try:
            start_time = datetime.utcnow()
            ping_ok = False
            latency = None

            try:
                response = requests.head(channel.stream_url, timeout=min(10, timeout), headers=headers, allow_redirects=True)
                latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                ping_ok = response.status_code < 400
                ctype = response.headers.get('Content-Type', '').lower()
                if ping_ok and 'text/html' in ctype:
                    ping_ok = False
            except Exception:
                try:
                    response = requests.get(channel.stream_url, timeout=timeout, headers=headers, stream=True)
                    latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                    ping_ok = response.status_code < 400
                    ctype = response.headers.get('Content-Type', '').lower()
                    if ping_ok and 'text/html' in ctype:
                        ping_ok = False
                    if ping_ok:
                        cl = response.headers.get('Content-Length')
                        if cl and int(cl) == 0:
                            ping_ok = False
                    response.close()
                except Exception:
                    ping_ok = False
                    latency = None

            if ping_ok:
                channel.latency = int(latency) if latency else None
                channel.status = 'live'
                if latency < 500:
                    channel.quality = 'excellent'
                elif latency < 1500:
                    channel.quality = 'good'
                else:
                    channel.quality = 'poor'

            enable_ffprobe = SettingService.get(db, 'ENABLE_FFPROBE_DETAIL', True) and not fast_mode
            success = False
            if enable_ffprobe:
                success = HealthCheckService._update_stream_specs(db, channel)
            else:
                success = ping_ok

            if not success:
                if not ping_ok:
                    channel.status = 'die'
                    channel.error_message = "Stream is unreachable."
                else:
                    channel.status = 'live'
                    channel.error_message = "FFprobe failed, but URL is responsive."
                channel.quality = None
                if not ping_ok:
                    channel.latency = None
                channel.resolution = None
                channel.audio_codec = None
                channel.video_codec = None
                channel.bitrate = None
            else:
                channel.status = 'live'
                channel.error_message = None

        except Exception as e:
            logger.error(f"Check error for {channel.name}: {e}", exc_info=True)
            channel.status = 'die'
            channel.error_message = str(e)
            channel.quality = None
            channel.latency = None
            channel.resolution = None

        channel.last_checked_at = datetime.utcnow()
        db.commit()

        logger.info(f" [HEALTH-RESULT] {channel.name} -> {channel.status.upper()}")
        return {
            'status': channel.status,
            'latency': channel.latency,
            'resolution': channel.resolution,
            'stream_format': channel.stream_format,
            'quality': channel.quality,
            'last_checked': channel.last_checked_at.isoformat(),
        }

    @staticmethod
    def _update_stream_specs(db: Session, channel):
        """Uses ffprobe to extract resolution, audio info, and detect VOD vs LIVE."""
        url_lower = channel.stream_url.lower()
        if '.m3u8' in url_lower: channel.stream_format = 'hls'
        elif '.mp4' in url_lower: channel.stream_format = 'mp4'
        elif '.ts' in url_lower: channel.stream_format = 'ts'

        from app.modules.settings.services import SettingService
        ffprobe_bin = SettingService.get(db, 'FFPROBE_PATH', 'ffprobe')
        ffprobe_path = shutil.which(ffprobe_bin)
        if not ffprobe_path:
            return False

        cmd = [
            ffprobe_path, '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams', '-show_format',
            '-timeout', '5000000',
            channel.stream_url,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                streams = data.get('streams', [])
                if not streams:
                    return False
                fmt = data.get('format', {})
                duration = fmt.get('duration')
                try:
                    channel.stream_type = 'vod' if duration and float(duration) > 0 else 'live'
                except Exception:
                    channel.stream_type = 'live'
                for s in streams:
                    if s.get('codec_type') == 'video':
                        w, h = s.get('width'), s.get('height')
                        if w and h:
                            channel.resolution = f"{w}x{h}"
                    elif s.get('codec_type') == 'audio':
                        channel.audio_codec = s.get('codec_name', '').upper()
                return True
            return False
        except Exception:
            return False

    @staticmethod
    def start_background_scan(db: Session, mode='all', days=None, playlist_id=None, group=None, delay=None):
        """Starts a background scan task."""
        state = ScannerStatus.get_singleton(db)
        if state.is_running:
            return 'queued'

        state.is_running = True
        state.stop_requested = False
        state.playlist_id = playlist_id
        state.current = 0
        state.current_name = "Starting worker..."
        db.commit()

        from app.core.task_dispatcher import TaskDispatcher
        TaskDispatcher.dispatch(
            HealthCheckService._run_scan_logic,
            mode=mode, days=days, playlist_id=playlist_id, group=group, manual_delay=delay,
        )
        return 'started'

    @staticmethod
    def _run_scan_logic(mode='all', days=None, playlist_id=None, group=None, manual_delay=None):
        """Internal scan logic. Runs in a background thread with its own session."""
        db = SessionFactory()
        try:
            from app.modules.settings.services import SettingService

            state = ScannerStatus.get_singleton(db)
            state.is_running = True
            state.current = 0
            state.live_count = 0
            state.die_count = 0
            state.unknown_count = 0
            state.playlist_id = playlist_id
            state.mode = mode
            state.group = group
            state.logs_json = '[]'
            db.commit()

            query = db.query(Channel).filter_by(is_passthrough=False)

            if playlist_id:
                from app.modules.playlists.models import PlaylistProfile
                profile = db.query(PlaylistProfile).get(playlist_id)
                if profile:
                    if profile.is_system:
                        if profile.owner_id:
                            oid = int(profile.owner_id)
                            if "protected" in profile.slug:
                                query = query.filter(Channel.owner_id == oid, Channel.is_original == True)
                            else:
                                from sqlalchemy import or_
                                query = query.filter(or_(Channel.owner_id == oid, Channel.is_public == True))
                        else:
                            query = query.filter_by(is_public=True)
                    else:
                        cids = [e.channel_id for e in profile.entries]
                        if cids:
                            query = query.filter(Channel.id.in_(cids))
                        else:
                            query = query.filter(Channel.id == -1)
                else:
                    query = query.filter(Channel.id == -1)

            total_count = query.count()
            is_massive = total_count > 1000
            channels = query.all()
            state.total = len(channels)
            db.commit()

            logger.info(f" [SCAN-START] Mode: {mode}, PlaylistID: {playlist_id}, Channels: {len(channels)}")

            for idx, channel in enumerate(channels):
                # Check stop signal
                stop = db.execute(text("SELECT stop_requested FROM health_scanner_status LIMIT 1")).scalar()
                if stop:
                    logger.warning(" [SCAN-STOP] Stop signal received.")
                    break

                state.current = idx + 1
                state.current_name = channel.name
                db.commit()

                step_timeout = 2 if is_massive else 3
                step_fast = True if is_massive else False
                result = HealthCheckService.check_stream(db, channel.id, force=True, timeout=step_timeout, fast_mode=step_fast)

                if result.get('status') == 'live':
                    state.live_count += 1
                elif result.get('status') == 'die':
                    state.die_count += 1
                db.commit()

                if manual_delay:
                    time.sleep(manual_delay)
                else:
                    time.sleep(0.2)

            logger.info(f" [SCAN-COMPLETE] Live: {state.live_count}, Die: {state.die_count}")
        except Exception as e:
            logger.error(f" [SCAN-ERROR] {e}", exc_info=True)
        finally:
            try:
                state = ScannerStatus.get_singleton(db)
                state.is_running = False
                state.stop_requested = False
                db.commit()
            except Exception:
                pass
            db.close()

    @staticmethod
    def trigger_passive_check(db: Session, channel_id: int):
        """Triggers a background health check when a channel is accessed."""
        from app.modules.settings.services import SettingService
        if not SettingService.get(db, 'ENABLE_HEALTH_SYSTEM', True):
            return
        if not SettingService.get(db, 'ENABLE_PASSIVE_CHECK', True):
            return

        from app.core.task_dispatcher import TaskDispatcher

        def _passive_check():
            session = SessionFactory()
            try:
                HealthCheckService.check_stream(session, channel_id, force=False, fast_mode=True, timeout=5)
            finally:
                session.close()

        TaskDispatcher.dispatch(_passive_check)

    @staticmethod
    def stop_scan(db: Session):
        try:
            db.rollback()
            status = ScannerStatus.get_singleton(db)
            if status:
                status.stop_requested = True
                db.commit()
                logger.warning(" [SYSTEM] Stop signal sent to worker.")
        except Exception as e:
            db.rollback()
            logger.error(f" [CRITICAL] Failed to signal stop: {e}")

    @staticmethod
    def get_status(db: Session) -> dict:
        status = ScannerStatus.get_singleton(db)
        return {
            'is_running': status.is_running,
            'total': status.total,
            'current': status.current,
            'current_name': status.current_name,
            'live_count': status.live_count,
            'die_count': status.die_count,
            'playlist_id': status.playlist_id,
        }

    @staticmethod
    def batch_check_streams(db: Session, ids: list, fast_mode=False) -> list:
        results = []
        for channel_id in ids:
            r = HealthCheckService.check_stream(db, channel_id, force=True, fast_mode=fast_mode)
            results.append(r)
        return results

    @staticmethod
    def process_scan_queue_loop():
        """Daemon thread loop that processes the scan queue sequentially."""
        logger.info("[QUEUE-WORKER] Starting background Scan Queue worker daemon...")
        import time
        while True:
            time.sleep(1)  # Prevent CPU spinning
            db = SessionFactory()
            try:
                from app.modules.settings.services import SettingService
                from app.modules.health.models import ScanQueue
                
                # Check delay setting
                delay = int(SettingService.get(db, 'SCAN_QUEUE_DELAY_SECONDS', '5'))
                
                # Find oldest pending queue item, prioritizing high priority items (priority=1)
                item = db.query(ScanQueue).filter_by(status='pending').order_by(ScanQueue.priority.desc(), ScanQueue.id.asc()).first()
                if item:
                    logger.info(f"[QUEUE-WORKER] Processing item ID {item.id} (Channel ID {item.channel_id}, Priority {item.priority})")
                    item.status = 'processing'
                    db.commit()
                    
                    # Full check (force=True)
                    res = HealthCheckService.check_stream(db, item.channel_id, force=True, timeout=10)
                    
                    # Update queue status
                    status = 'success' if res.get('status') == 'live' else 'failed'
                    item.status = status
                    item.error_message = res.get('skipped') or res.get('error_message') or None
                    item.processed_at = datetime.utcnow()
                    db.commit()
                    
                    logger.info(f"[QUEUE-WORKER] Item ID {item.id} done -> {status.upper()}")
                    time.sleep(max(1, delay))
            except Exception as e:
                db.rollback()
                logger.error(f"[QUEUE-WORKER] Scan Queue loop error: {e}", exc_info=True)
            finally:
                db.close()

    @staticmethod
    def prioritize_channel_in_queue(db: Session, channel_id: int):
        """Adds or updates a channel in the scan queue as high-priority pending."""
        from app.modules.health.models import ScanQueue
        item = db.query(ScanQueue).filter_by(channel_id=channel_id).first()
        if item:
            item.status = 'pending'
            item.priority = 1
        else:
            item = ScanQueue(channel_id=channel_id, status='pending', priority=1)
            db.add(item)
        db.commit()

