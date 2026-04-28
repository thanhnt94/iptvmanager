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
    def check_stream(channel_id, force=False, fast_mode=False):
        """Checks the connectivity and technical specs of a single stream URL."""
        channel = Channel.query.get(channel_id)
        if not channel:
            return
            
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
                response = requests.head(channel.stream_url, timeout=10, headers=headers, allow_redirects=True)
                latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                ping_ok = response.status_code < 400
                
                # Validation: If it's HTML, it's probably an error page, not a stream
                ctype = response.headers.get('Content-Type', '').lower()
                if ping_ok and 'text/html' in ctype:
                    # Some sites use HTML for everything, but mostly it's a "Not Found" page
                    # Let's double check with a GET if it's small
                    ping_ok = False 
            except:
                # Fallback to a tiny GET
                try:
                    response = requests.get(channel.stream_url, timeout=10, headers=headers, stream=True)
                    latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                    ping_ok = response.status_code < 400
                    
                    ctype = response.headers.get('Content-Type', '').lower()
                    if ping_ok and 'text/html' in ctype:
                        ping_ok = False
                    
                    # Also check if it's an empty body
                    if ping_ok:
                        content_length = response.headers.get('Content-Length')
                        if content_length and int(content_length) == 0:
                            ping_ok = False
                            
                    response.close()
                except:
                    ping_ok = False

            # 2. Latency/Connectivity check
            if ping_ok:
                channel.latency = latency
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
        db.session.commit()
        
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
    def batch_check_streams(channel_ids, fast_mode=False):
        """Checks multiple streams in parallel using the worker pool."""
        from flask import current_app
        app = current_app._get_current_object()
        
        results = []
        def check_worker(cid):
            with app.app_context():
                return HealthCheckService.check_stream(cid, force=True, fast_mode=fast_mode)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_id = {executor.submit(check_worker, cid): cid for cid in channel_ids}
            for future in concurrent.futures.as_completed(future_to_id):
                cid = future_to_id[future]
                try:
                    res = future.result()
                    results.append({'id': cid, 'status': 'ok', 'data': res})
                except Exception as exc:
                    results.append({'id': cid, 'status': 'error', 'message': str(exc)})
        return results

    @staticmethod
    def _update_stream_specs(channel):
        """Uses ffprobe to extract resolution, audio info, and detect VOD vs LIVE.
        Returns True if at least one stream is found, False otherwise."""
        
        # Initial guess from extension
        url_lower = channel.stream_url.lower()
        if '.m3u8' in url_lower: channel.stream_format = 'hls'
        elif '.mp4' in url_lower: channel.stream_format = 'mp4'
        elif '.ts' in url_lower: channel.stream_format = 'ts'
        elif '.mkv' in url_lower: channel.stream_format = 'mkv'
        elif '.mp3' in url_lower: channel.stream_format = 'mp3'

        # Extraction for Web Links
        is_direct = any(ext in url_lower for ext in ['.m3u8', '.ts', '.mp4', '.mkv', '.mp3', '.aac', 'playlist', 'udp://', 'rtp://', 'rtmp://'])
        probe_url = channel.stream_url
        if not is_direct:
            from app.modules.channels.services import ExtractorService
            ext_res = ExtractorService.extract_direct_url(channel.stream_url)
            if ext_res.get('success') and ext_res.get('links'):
                probe_url = ext_res['links'][0]['url']
                logger.debug(f"HealthCheck: Probing extracted URL for {channel.name}")

        from app.modules.settings.services import SettingService
        ffprobe_bin = SettingService.get('FFPROBE_PATH', 'ffprobe')
        ffprobe_path = shutil.which(ffprobe_bin)
        
        if not ffprobe_path:
            logger.error(f"HealthCheckService: FFprobe binary not found: {ffprobe_bin}. Please install FFmpeg/FFprobe.")
            return False

        cmd = [
            ffprobe_path, '-v', 'quiet', 
            '-print_format', 'json', 
            '-show_streams', '-show_format',
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '-probesize', '256000', 
            '-analyzeduration', '500000',
            '-timeout', '4000000', # 4 seconds internal timeout
            probe_url
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                streams = data.get('streams', [])
                if not streams:
                    return False
                
                # Check Duration for VOD vs LIVE
                format_info = data.get('format', {})
                duration = format_info.get('duration')
                bitrate_raw = format_info.get('bit_rate')
                
                if bitrate_raw:
                    try: channel.bitrate = int(int(bitrate_raw) / 1000)
                    except: pass
                
                # Better format detection from ffprobe
                fmt_name = format_info.get('format_name', '').lower()
                if 'hls' in fmt_name or 'applehttp' in fmt_name: channel.stream_format = 'hls'
                elif 'mp4' in fmt_name or 'mov' in fmt_name: channel.stream_format = 'mp4'
                elif 'mpegts' in fmt_name: channel.stream_format = 'ts'
                elif 'matroska' in fmt_name or 'webm' in fmt_name: channel.stream_format = 'mkv'
                elif 'aac' in fmt_name: channel.stream_format = 'aac'
                elif 'mp3' in fmt_name: channel.stream_format = 'mp3'

                try:
                    if duration and float(duration) > 0:
                        channel.stream_type = 'vod'
                    else:
                        channel.stream_type = 'live'
                except:
                    channel.stream_type = 'live'

                for stream in streams:
                    if stream.get('codec_type') == 'video':
                        channel.video_codec = stream.get('codec_name', '').upper()
                        w = stream.get('width')
                        h = stream.get('height')
                        if w and h:
                            channel.resolution = f"{w}x{h}"
                    elif stream.get('codec_type') == 'audio':
                        channel.audio_codec = stream.get('codec_name', '').upper()
                return True
            return False
        except Exception as e:
            print(f"FFprobe specs error for {channel.name}: {e}")
            return False

    @staticmethod
    def get_status():
        """Fetches the current scan state from the database."""
        status = ScannerStatus.get_singleton()
        try:
            logs = json.loads(status.logs_json)
        except:
            logs = []
            
        return {
            'is_running': status.is_running,
            'total': status.total,
            'current': status.current,
            'current_name': status.current_name,
            'current_id': status.current_id,
            'live_count': status.live_count,
            'die_count': status.die_count,
            'unknown_count': status.unknown_count,
            'stop_requested': status.stop_requested,
            'mode': status.mode,
            'group': status.group,
            'playlist_id': status.playlist_id,
            'logs': logs
        }

    @staticmethod
    def _is_stop_requested():
        """Checks Redis for an active stop signal."""
        from flask import current_app
        from app.core.celery_app import celery_init_app
        # We need to get redis_client. In our structure, it's usually available via app extensions or direct connection.
        # For simplicity, we'll check a key in Redis.
        try:
            import redis
            r = redis.from_url(current_app.config.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'))
            return r.get('iptv:scan:stop_signal') == b'1'
        except:
            return False

    @staticmethod
    def stop_scan():
        """Sends a stop signal via Redis + immediate DB cleanup."""
        try:
            import redis
            from flask import current_app
            r = redis.from_url(current_app.config.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'))
            r.setex('iptv:scan:stop_signal', 300, '1') # Signal active for 5 mins
        except Exception as e:
            logger.error(f"Failed to send Redis stop signal: {e}")

        # Immediately update DB so frontend poll sees stopped state
        try:
            state = ScannerStatus.get_singleton()
            state.is_running = False
            state.stop_requested = True
            state.current_name = None
            db.session.commit()
            
            from app.modules.playlists.models import PlaylistProfile
            for p in PlaylistProfile.query.filter_by(is_scanning=True).all():
                p.is_scanning = False
                p.current_scanning_name = None
            db.session.commit()
        except Exception as e:
            logger.error(f"Stop DB cleanup error: {e}")
        logger.info("Stop signal sent via Redis + DB cleaned.")

    @staticmethod
    def _add_log(name, status, error=None):
        state = ScannerStatus.get_singleton()
        try:
            logs = json.loads(state.logs_json)
        except:
            logs = []
            
        log_entry = {
            'time': datetime.utcnow().strftime('%H:%M:%S'),
            'name': name,
            'status': status,
            'error': error
        }
        logs.insert(0, log_entry)
        if len(logs) > 50:
            logs.pop()
        
        state.logs_json = json.dumps(logs)
        # No immediate commit; usually called within a batch process    @staticmethod
    def start_background_scan(app, mode='all', days=None, playlist_id=None, group=None, delay=None):
        """Starts a scan or queues it if another scan is already running."""
        current_status = ScannerStatus.get_singleton()
        if current_status.is_running:
            return 'queued' # Celery handles queueing implicitly, but we can still track it if needed
            
        from app.modules.health.tasks import background_scan_task
        background_scan_task.delay(mode=mode, days=days, playlist_id=playlist_id, group=group, delay=delay)
        return 'started'

    @staticmethod
    def _run_scan_logic(app, mode, days, playlist_id, group, manual_delay):
        """Internal logic for scanning, called by Celery task."""
        # This is the original content of run_scan but without the thread wrapper
        try:
            # Type conversions
            try:
                if playlist_id: playlist_id = int(playlist_id)
                if days: days = int(days)
            except: pass

            logger.info(f"Celery Scanner START — Playlist: {playlist_id}, Mode: {mode}, Group: {group}")
            
            # Clear stop signal in Redis before starting
            try:
                import redis
                from flask import current_app
                r = redis.from_url(current_app.config.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'))
                r.delete('iptv:scan:stop_signal')
            except: pass

            state = ScannerStatus.get_singleton()
            state.is_running = True
            state.stop_requested = False
            state.mode = mode
            state.group = group or 'all'
            state.playlist_id = playlist_id
            state.current = 0
            state.current_name = None
            state.current_id = None
            db.session.commit()

            # Build channel query scoped to the target playlist
            query = Channel.query.filter_by(is_passthrough=False)
            from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
            if playlist_id:
                profile = PlaylistProfile.query.get(playlist_id)
                if not (profile and profile.is_system):
                    query = query.join(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id)
            
            if group and group != 'all':
                query = query.filter(Channel.group_name == group)

            if mode == 'never':
                query = query.filter(Channel.last_checked_at == None)
            elif mode == 'die':
                query = query.filter(Channel.status == 'die')
            elif mode == 'outdated' and days:
                from datetime import timedelta
                threshold = datetime.utcnow() - timedelta(days=int(days))
                query = query.filter((Channel.last_checked_at == None) | (Channel.last_checked_at < threshold))
            
            channels = query.all()
            
            # Sort by scan priority: unknown/None → die → live
            priority = {'unknown': 0, None: 0, 'die': 1, 'live': 2}
            channels.sort(key=lambda c: priority.get(c.status, 0))
            
            # Compute initial counts ONLY from channels in this scan scope
            state.total = len(channels)
            state.live_count = sum(1 for c in channels if c.status == 'live')
            state.die_count = sum(1 for c in channels if c.status == 'die')
            state.unknown_count = sum(1 for c in channels if c.status == 'unknown' or c.status is None)
            db.session.commit()
            
            logger.info(f"Celery Scanner: Found {len(channels)} channels. Live={state.live_count}, Die={state.die_count}, Unknown={state.unknown_count}")
            
            if not channels:
                state.is_running = False
                db.session.commit()
                return

            # Mark playlist as scanning in DB
            if playlist_id:
                p_profile = PlaylistProfile.query.get(playlist_id)
                if p_profile:
                    p_profile.is_scanning = True
                    db.session.commit()

            for idx, channel in enumerate(channels):
                # CHECK STOP — via Redis
                if HealthCheckService._is_stop_requested():
                    logger.info(f"Scanner: STOPPED by user (Redis signal) at {idx}/{len(channels)}")
                    break
                
                state.current_name = channel.name
                state.current_id = channel.id
                state.current = idx + 1
                
                # Sync current name to PlaylistProfile
                if playlist_id:
                    p_profile = PlaylistProfile.query.get(playlist_id)
                    if p_profile:
                        p_profile.current_scanning_name = channel.name
                db.session.commit()
                
                old_status = channel.status or 'unknown'
                
                # Check stream (blocking call within worker)
                result = HealthCheckService.check_stream(channel.id)
                
                if HealthCheckService._is_stop_requested():
                    break
                    
                if result:
                    channel.status = result.get('status', 'unknown')
                    channel.error_message = result.get('error_message')
                
                new_status = channel.status or 'unknown'
                HealthCheckService._add_log(channel.name, new_status, channel.error_message)
                
                # Update LIVE/DIE counts when status changes
                if old_status != new_status:
                    if old_status == 'unknown': state.unknown_count = max(0, state.unknown_count - 1)
                    elif old_status == 'live': state.live_count = max(0, state.live_count - 1)
                    elif old_status == 'die': state.die_count = max(0, state.die_count - 1)
                    
                    if new_status == 'unknown': state.unknown_count += 1
                    elif new_status == 'live': state.live_count += 1
                    elif new_status == 'die': state.die_count += 1
                
                # Commit EVERY channel so frontend sees real-time progress
                db.session.commit()
                
                # Detailed Terminal Logging
                progress_pct = (state.current / (state.total or 1)) * 100
                logger.info(f" [SCAN] {state.current}/{state.total} ({progress_pct:.0f}%) | {channel.name} -> {new_status}")
                
                # Delay handling
                # Simple sleep but check for stop frequently
                for _s in range(int(float(wait_time))):
                    if HealthCheckService._is_stop_requested():
                        break
                    time.sleep(1)
                
                if HealthCheckService._is_stop_requested():
                    break

        except Exception as e:
            logger.error(f"Scanner CRITICAL ERROR: {e}", exc_info=True)
        finally:
            # Always clean up
            try:
                state = ScannerStatus.get_singleton()
                state.is_running = False
                state.stop_requested = False
                state.current_name = None
                db.session.commit()
                
                if playlist_id:
                    from app.modules.playlists.models import PlaylistProfile as PP
                    p_profile = PP.query.get(playlist_id)
                    if p_profile:
                        p_profile.is_scanning = False
                        p_profile.current_scanning_name = None
                        db.session.commit()
                
                logger.info(f"Scanner DONE — L:{state.live_count} D:{state.die_count} U:{state.unknown_count}")
            except Exception as cleanup_err:
                logger.error(f"Scanner cleanup error: {cleanup_err}")
            finally:
                db.session.remove()

    @staticmethod
    def trigger_passive_check(channel_id):
        """Triggers a background health check when a channel is accessed."""
        from app.modules.settings.services import SettingService
        if not SettingService.get('ENABLE_HEALTH_SYSTEM', True): return
        if not SettingService.get('ENABLE_PASSIVE_CHECK', True): return

        logger.info(f"Health: Triggering passive check for channel {channel_id} (Background Task)")
        from app.modules.health.tasks import check_channel_task
        check_channel_task.delay(channel_id, force=True, fast_mode=True)

    @staticmethod
    def check_all_channels():
        # Keep old method for backward compatibility or simple triggers
        channels = Channel.query.all()
        for channel in channels:
            HealthCheckService.check_stream(channel.id)
        return len(channels)
