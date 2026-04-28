import requests
import subprocess
import shutil
import json
import time
import threading
import concurrent.futures
from datetime import datetime
import logging
from app.modules.channels.models import Channel
from app.modules.health.models import ScannerStatus
from app.core.database import db

logger = logging.getLogger('iptv')

class HealthCheckService:
    # In-memory stop signal — works instantly across threads, no DB dependency
    _stop_event = threading.Event()
    # Scan queue for consecutive playlist scans
    _scan_queue = []
    _queue_lock = threading.Lock()

    @staticmethod
    def check_stream(channel_id, force=False, fast_mode=False, timeout=10):
        """Checks the connectivity and technical specs of a single stream URL."""
        channel = Channel.query.get(channel_id)
        if not channel:
            logger.error(f" [HEALTH-ERROR] Channel ID {channel_id} not found!")
            return
            
        logger.info(f" [HEALTH-START] Checking {channel.name} (Force={force}, Fast={fast_mode}, Timeout={timeout}s)")
            
        from app.modules.settings.services import SettingService
        if not SettingService.get('ENABLE_HEALTH_SYSTEM', True):
            return {'status': channel.status, 'skipped': 'Master switch OFF'}

        if channel.is_passthrough:
            return {'status': 'live', 'skipped': 'Passthrough mode active'}

        # 1. Skip if checked recently (TTL setting) unless forced
        if not force and channel.last_checked_at:
            ttl_minutes = SettingService.get('HEARTBEAT_TTL_MINUTES', 30)
            delta = (datetime.utcnow() - channel.last_checked_at).total_seconds()
            if delta < (ttl_minutes * 60) and channel.status == 'live':
                logger.debug(f"Skipping check for {channel.name}, checked {delta:.1f}s ago (TTL: {ttl_minutes}m).")
                return {'status': channel.status, 'skipped': 'TTL active'}
            
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Referer': channel.stream_url
        }
        
        try:
            # Measure latency
            start_time = datetime.utcnow()
            ping_ok = False
            latency = None
            
            # Try a quick HEAD first
            try:
                response = requests.head(channel.stream_url, timeout=min(10, timeout), headers=headers, allow_redirects=True)
                latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                ping_ok = response.status_code < 400
                
                # Validation: If it's HTML, it's probably an error page, not a stream
                ctype = response.headers.get('Content-Type', '').lower()
                if ping_ok and 'text/html' in ctype:
                    logger.debug(f" [HTTP-INFO] {channel.name} returned HTML, falling back to GET check.")
                    ping_ok = False
            except:
                # Fallback to a tiny GET
                try:
                    logger.debug(f" [HTTP-TRY] Requesting {channel.stream_url} (Timeout {timeout}s)...")
                    response = requests.get(channel.stream_url, timeout=timeout, headers=headers, stream=True)
                    latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                    ping_ok = response.status_code < 400
                    logger.info(f" [HTTP-RES] {channel.name} returned {response.status_code} in {latency:.0f}ms")
                    
                    ctype = response.headers.get('Content-Type', '').lower()
                    if ping_ok and 'text/html' in ctype:
                        ping_ok = False
                    
                    # Also check if it's an empty body
                    if ping_ok:
                        content_length = response.headers.get('Content-Length')
                        if content_length and int(content_length) == 0:
                            ping_ok = False
                            
                    response.close()
                except Exception as req_err:
                    logger.warning(f" [HTTP-FAIL] {channel.name} request failed: {req_err}")
                    ping_ok = False
                    latency = None

            # 2. Latency/Connectivity check
            if ping_ok:
                channel.latency = int(latency) if latency else None
                channel.status = 'live'  # URL is responsive
                if latency < 500: channel.quality = 'excellent'
                elif latency < 1500: channel.quality = 'good'
                else: channel.quality = 'poor'
            
            # 3. Stream Specs via FFprobe (Heavy)
            # Only run ffprobe if NOT in fast_mode AND setting is ON
            enable_ffprobe = SettingService.get('ENABLE_FFPROBE_DETAIL', True) and not fast_mode
            success = False
            if enable_ffprobe:
                success = HealthCheckService._update_stream_specs(channel)
            else:
                if fast_mode:
                    logger.debug(f"Fast Mode: Skipping FFprobe for {channel.name}")
                else:
                    logger.debug(f"Skipping FFprobe for {channel.name} (Deep Analysis OFF)")
                success = ping_ok # In fast mode, ping_ok is enough for success status
            
            if not success:
                if not ping_ok:
                    channel.status = 'die'
                    channel.error_message = "Stream is unreachable (Ping/HEAD failed)."
                else:
                    # ping_ok but ffprobe failed - let it be LIVE but unverified
                    channel.status = 'live'
                    channel.error_message = "FFprobe failed to extract specs, but URL is responsive."
                
                channel.quality = None
                # Don't clear latency if ping_ok was True
                if not ping_ok: channel.latency = None
                channel.resolution = None
                channel.audio_codec = None
                channel.video_codec = None
                channel.bitrate = None
            else:
                channel.status = 'live'
                channel.error_message = None
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Check error for {channel.name}: {error_msg}", exc_info=True)
            channel.status = 'die'
            channel.error_message = error_msg
            channel.quality = None
            channel.latency = None
            channel.resolution = None
            channel.audio_codec = None
            channel.video_codec = None
            channel.bitrate = None
            channel.stream_type = 'unknown'
            channel.stream_format = None
            
        channel.last_checked_at = datetime.utcnow()
        logger.debug(f" [DB-PRE-COMMIT] Attempting to save {channel.status.upper()} for {channel.name}...")
        db.session.commit()
        logger.info(f" [DB-SAVE] {channel.name} status updated to {channel.status.upper()} (Latency: {channel.latency}ms)")
        
        return {
            'status': channel.status,
            'latency': channel.latency,
            'resolution': channel.resolution,
            'stream_format': channel.stream_format,
            'stream_type': channel.stream_type,
            'quality': channel.quality,
            'error_message': channel.error_message,
            'last_checked': channel.last_checked_at.isoformat()
        }

    @staticmethod
    def _update_stream_specs(channel):
        """Uses ffprobe to extract resolution, audio info, and detect VOD vs LIVE."""
        url_lower = channel.stream_url.lower()
        if '.m3u8' in url_lower: channel.stream_format = 'hls'
        elif '.mp4' in url_lower: channel.stream_format = 'mp4'
        elif '.ts' in url_lower: channel.stream_format = 'ts'
        elif '.mkv' in url_lower: channel.stream_format = 'mkv'

        probe_url = channel.stream_url
        from app.modules.settings.services import SettingService
        ffprobe_bin = SettingService.get('FFPROBE_PATH', 'ffprobe')
        ffprobe_path = shutil.which(ffprobe_bin)
        
        if not ffprobe_path:
            return False

        cmd = [
            ffprobe_path, '-v', 'quiet', 
            '-print_format', 'json', 
            '-show_streams', '-show_format',
            '-timeout', '5000000', 
            probe_url
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                streams = data.get('streams', [])
                if not streams: return False
                
                format_info = data.get('format', {})
                duration = format_info.get('duration')
                try:
                    if duration and float(duration) > 0: channel.stream_type = 'vod'
                    else: channel.stream_type = 'live'
                except: channel.stream_type = 'live'

                for stream in streams:
                    if stream.get('codec_type') == 'video':
                        w, h = stream.get('width'), stream.get('height')
                        if w and h: channel.resolution = f"{w}x{h}"
                    elif stream.get('codec_type') == 'audio':
                        channel.audio_codec = stream.get('codec_name', '').upper()
                return True
            return False
        except: return False

    @staticmethod
    def start_background_scan(app, mode='all', days=None, playlist_id=None, group=None, delay=None):
        """Starts a background scan task."""
        current_status = ScannerStatus.get_singleton()
        if current_status.is_running: return 'queued'
        from app.modules.health.tasks import background_scan_task
        background_scan_task.delay(mode=mode, days=days, playlist_id=playlist_id, group=group, delay=delay)
        return 'started'

    @staticmethod
    def _run_scan_logic(app, mode, days, playlist_id, group, manual_delay):
        """Internal scan logic."""
        try:
            state = ScannerStatus.get_singleton()
            state.is_running = True
            state.current = 0
            db.session.commit()

            query = Channel.query.filter_by(is_passthrough=False)
            from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
            if playlist_id:
                query = query.join(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id)
            
            channels = query.all()
            state.total = len(channels)
            db.session.commit()

            for idx, channel in enumerate(channels):
                if HealthCheckService._is_stop_requested(): break
                state.current = idx + 1
                state.current_name = channel.name
                db.session.commit()
                HealthCheckService.check_stream(channel.id)
                time.sleep(manual_delay or 1)

        finally:
            state = ScannerStatus.get_singleton()
            state.is_running = False
            db.session.commit()

    @staticmethod
    def _is_stop_requested():
        return False # Simple placeholder

    @staticmethod
    def trigger_passive_check(channel_id):
        """Triggers a background health check when a channel is accessed."""
        from app.modules.settings.services import SettingService
        if not SettingService.get('ENABLE_HEALTH_SYSTEM', True): return
        if not SettingService.get('ENABLE_PASSIVE_CHECK', True): return

        from app.modules.channels.models import Channel
        ch = Channel.query.get(channel_id)
        ch_name = ch.name if ch else f"ID:{channel_id}"

        logger.info(f"Health: Triggering passive check for {ch_name} (Background Task, Timeout: 5s)")
        from app.modules.health.tasks import check_channel_task
        check_channel_task.delay(channel_id, force=True, fast_mode=True, timeout=5)

    @staticmethod
    def get_status():
        status = ScannerStatus.get_singleton()
        return {'is_running': status.is_running, 'total': status.total, 'current': status.current}

    @staticmethod
    def check_all_channels():
        from app.modules.channels.models import Channel
        channels = Channel.query.all()
        for channel in channels:
            HealthCheckService.check_stream(channel.id)
        return len(channels)
