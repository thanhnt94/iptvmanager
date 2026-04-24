import requests
import subprocess
import shutil
import json
import time
import concurrent.futures
from datetime import datetime
import logging
from app.modules.channels.models import Channel
from app.modules.health.models import ScannerStatus
from app.core.database import db

logger = logging.getLogger('iptv')

class HealthCheckService:
    @staticmethod
    def check_stream(channel_id, force=False, fast_mode=False):
        """Checks the connectivity and technical specs of a single stream URL."""
        channel = Channel.query.get(channel_id)
        if not channel:
            return
            
        from app.modules.settings.services import SettingService
        if not SettingService.get('ENABLE_HEALTH_SYSTEM', True):
            return {'status': channel.status, 'skipped': 'Master switch OFF'}

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
                response = requests.head(channel.stream_url, timeout=5, headers=headers, allow_redirects=True)
                latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                ping_ok = response.status_code < 400
            except:
                # Fallback to a tiny GET
                try:
                    response = requests.get(channel.stream_url, timeout=5, headers=headers, stream=True)
                    latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                    ping_ok = response.status_code < 400
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
    def stop_scan():
        status = ScannerStatus.get_singleton()
        status.stop_requested = True
        db.session.commit()

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
        # No immediate commit; usually called within a batch process

    @staticmethod
    def start_background_scan(app, mode='all', days=None, playlist_id=None, group=None, delay=None):
        """Starts the scanning process in a background thread."""
        current_status = ScannerStatus.get_singleton()
        if current_status.is_running:
            return
            
        def run_scan(app, mode, days, playlist_id, group, manual_delay):
            app_context = app.app_context()
            with app_context:
                state = ScannerStatus.get_singleton()
                try:
                    # Type conversions
                    try:
                        if playlist_id: playlist_id = int(playlist_id)
                        if days: days = int(days)
                    except: pass

                    logger.info(f"Persistent Scanner: Start requested. Mode: {mode}, Group: {group}")
                    state.is_running = True
                    state.stop_requested = False
                    state.mode = mode
                    state.group = group or 'all'
                    state.playlist_id = playlist_id
                    state.current = 0
                    
                    # Update counts from DB
                    from sqlalchemy import func
                    counts = dict(db.session.query(Channel.status, func.count(Channel.id)).group_by(Channel.status).all())
                    state.live_count = counts.get('live', 0)
                    state.die_count = counts.get('die', 0)
                    state.unknown_count = counts.get('unknown', 0)
                    db.session.commit()
                    
                    query = Channel.query
                    if playlist_id:
                        from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
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
                    state.total = len(channels)
                    db.session.commit()
                    
                    if not channels:
                        state.is_running = False
                        db.session.commit()
                        return
    
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                        for idx, channel in enumerate(channels):
                            # Re-fetch state object to catch external stop requests
                            state = ScannerStatus.get_singleton() 
                            if state.stop_requested:
                                break
                            
                            state.current_name = channel.name
                            state.current_id = channel.id
                            
                            old_status = channel.status
                            
                            def check_with_context(app_obj, cid):
                                with app_obj.app_context():
                                    return HealthCheckService.check_stream(cid)

                            future = executor.submit(check_with_context, app, channel.id)
                            try:
                                result = future.result(timeout=25) 
                                if result:
                                    channel.status = result.get('status', 'unknown')
                                    channel.error_message = result.get('error_message')
                            except concurrent.futures.TimeoutError:
                                channel.status = 'die'
                                channel.error_message = "Diagnostic Timeout (Server too slow)"
                                db.session.commit()
                            except Exception as e:
                                logger.error(f"Scanner internal error for {channel.id}: {e}")
        
                            new_status = channel.status
                            HealthCheckService._add_log(channel.name, new_status, channel.error_message)
                            
                            if old_status != new_status:
                                if old_status == 'unknown': state.unknown_count -= 1
                                elif old_status == 'live': state.live_count -= 1
                                elif old_status == 'die': state.die_count -= 1
                                
                                if new_status == 'unknown': state.unknown_count += 1
                                elif new_status == 'live': state.live_count += 1
                                elif new_status == 'die': state.die_count += 1
            
                            state.current = idx + 1
                            
                            # Commit progress to Database every 10 channels (Performance balance)
                            if (idx + 1) % 10 == 0:
                                db.session.commit()
                                
                            if manual_delay is not None:
                                time.sleep(float(manual_delay))
                            else:
                                from app.modules.settings.services import SettingService
                                time.sleep(int(SettingService.get('SCAN_DELAY_SECONDS', '1')))
                    
                    state = ScannerStatus.get_singleton()
                    state.is_running = False
                    db.session.commit()
                except Exception as e:
                    logger.error(f"Scanner CRITICAL ERROR: {e}", exc_info=True)
                finally:
                    state = ScannerStatus.get_singleton()
                    state.is_running = False
                    db.session.commit()
                    db.session.remove()

        status_obj = ScannerStatus.get_singleton()
        status_obj.is_running = True
        db.session.commit()
        import threading
        thread = threading.Thread(target=run_scan, args=(app, mode, days, playlist_id, group, delay))
        thread.daemon = True
        thread.start()

    @staticmethod
    def trigger_passive_check(channel_id):
        """Triggers a background health check when a channel is accessed."""
        from app.modules.settings.services import SettingService
        if not SettingService.get('ENABLE_HEALTH_SYSTEM', True): return
        if not SettingService.get('ENABLE_PASSIVE_CHECK', True): return

        from flask import current_app
        app = current_app._get_current_object()
        
        def run_passive():
            with app.app_context():
                logger.debug(f"Passive HealthCheck triggered for channel {channel_id} (Fast Mode)")
                HealthCheckService.check_stream(channel_id, fast_mode=True)
        
        import threading
        thread = threading.Thread(target=run_passive)
        thread.daemon = True
        thread.start()

    @staticmethod
    def check_all_channels():
        # Keep old method for backward compatibility or simple triggers
        channels = Channel.query.all()
        for channel in channels:
            HealthCheckService.check_stream(channel.id)
        return len(channels)
