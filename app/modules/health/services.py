import requests
import subprocess
import json
import time
from datetime import datetime
import logging
from app.modules.channels.models import Channel
from app.core.database import db

logger = logging.getLogger('iptv')

class HealthCheckService:
    @staticmethod
    def check_stream(channel_id):
        """Checks the connectivity and technical specs of a single stream URL."""
        channel = Channel.query.get(channel_id)
        if not channel:
            return
            
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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

            if ping_ok:
                channel.latency = latency
                if latency < 500: channel.quality = 'excellent'
                elif latency < 1500: channel.quality = 'good'
                else: channel.quality = 'poor'
            
            # Use ffprobe as the source of truth for "Live" (must have actual media)
            success = HealthCheckService._update_stream_specs(channel)
            
            if success:
                channel.status = 'live'
                channel.error_message = None # Clear error on success
                # Fallback quality if latency check was blocked but stream is live
                if not channel.quality:
                    channel.quality = 'excellent'
            else:
                channel.status = 'die'
                channel.error_message = "FFprobe failed to extract streams. Stream might be offline or unsupported."
                channel.quality = None
                channel.latency = None
                channel.resolution = None
                channel.audio_codec = None
                channel.video_codec = None
                channel.bitrate = None
                channel.stream_type = 'unknown'
                channel.stream_format = None
                
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

        cmd = [
            'ffprobe', '-v', 'quiet', 
            '-print_format', 'json', 
            '-show_streams', '-show_format',
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '-probesize', '1000000', 
            '-analyzeduration', '1000000',
            channel.stream_url
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
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

    _scan_state = {
        'is_running': False,
        'total': 0,
        'current': 0,
        'current_name': '',
        'current_id': None,
        'live_count': 0,
        'die_count': 0,
        'unknown_count': 0,
        'stop_requested': False,
        'logs': [] # List of {time, name, status, error}
    }

    @staticmethod
    def get_status():
        return HealthCheckService._scan_state

    @staticmethod
    def stop_scan():
        HealthCheckService._scan_state['stop_requested'] = True

    @staticmethod
    def _add_log(name, status, error=None):
        log_entry = {
            'time': datetime.utcnow().strftime('%H:%M:%S'),
            'name': name,
            'status': status,
            'error': error
        }
        HealthCheckService._scan_state['logs'].insert(0, log_entry)
        if len(HealthCheckService._scan_state['logs']) > 50:
            HealthCheckService._scan_state['logs'].pop()

    @staticmethod
    def start_background_scan(app, mode='all', days=None, playlist_id=None):
        """Starts the scanning process in a background thread."""
        if HealthCheckService._scan_state['is_running']:
            return
            
        def run_scan(app_context, mode, days, playlist_id):
            with app_context:
                # Type conversions for JSON data
                try:
                    if playlist_id: playlist_id = int(playlist_id)
                    if days: days = int(days)
                except: pass

                HealthCheckService._scan_state['is_running'] = True
                HealthCheckService._scan_state['stop_requested'] = False
                HealthCheckService._scan_state['current'] = 0
                
                # Pre-load initial counts
                from sqlalchemy import func
                counts = db.session.query(Channel.status, func.count(Channel.id)).group_by(Channel.status).all()
                counts_dict = dict(counts)
                HealthCheckService._scan_state['live_count'] = counts_dict.get('live', 0)
                HealthCheckService._scan_state['die_count'] = counts_dict.get('die', 0)
                HealthCheckService._scan_state['unknown_count'] = counts_dict.get('unknown', 0)
                
                query = Channel.query
                
                if playlist_id:
                    from app.modules.playlists.models import PlaylistEntry, PlaylistProfile
                    profile = PlaylistProfile.query.get(playlist_id)
                    if profile and profile.is_system:
                        # System playlist 'alliptv' means scan ALL channels
                        pass
                    else:
                        query = query.join(PlaylistEntry).filter(PlaylistEntry.playlist_id == playlist_id)
                
                if mode == 'never':
                    query = query.filter(Channel.last_checked_at == None)
                elif mode == 'die':
                    query = query.filter(Channel.status == 'die')
                elif mode == 'outdated' and days:
                    from datetime import timedelta
                    threshold = datetime.utcnow() - timedelta(days=int(days))
                    query = query.filter((Channel.last_checked_at == None) | (Channel.last_checked_at < threshold))
                
                channels = query.all()
                HealthCheckService._scan_state['total'] = len(channels)
                
                if not channels:
                    HealthCheckService._scan_state['is_running'] = False
                    return

                for channel in channels:
                    if HealthCheckService._scan_state['stop_requested']:
                        break
                    
                    # Update current channel info for UI
                    HealthCheckService._scan_state['current_name'] = channel.name
                    HealthCheckService._scan_state['current_id'] = channel.id
                    
                    old_status = channel.status
                    HealthCheckService.check_stream(channel.id)
                    new_status = channel.status
                    
                    # Log the result
                    HealthCheckService._add_log(channel.name, new_status, channel.error_message)
                    
                    # Update counts if status changed
                    if old_status != new_status:
                        # Direct update logic
                        if old_status == 'unknown': HealthCheckService._scan_state['unknown_count'] -= 1
                        elif old_status == 'live': HealthCheckService._scan_state['live_count'] -= 1
                        elif old_status == 'die': HealthCheckService._scan_state['die_count'] -= 1
                        
                        if new_status == 'unknown': HealthCheckService._scan_state['unknown_count'] += 1
                        elif new_status == 'live': HealthCheckService._scan_state['live_count'] += 1
                        elif new_status == 'die': HealthCheckService._scan_state['die_count'] += 1

                    HealthCheckService._scan_state['current'] += 1
                    
                    # Configurable delay
                    from app.modules.settings.services import SettingService
                    delay = int(SettingService.get('SCAN_DELAY_SECONDS', '1'))
                    time.sleep(delay)
                
                HealthCheckService._scan_state['is_running'] = False

        import threading
        thread = threading.Thread(target=run_scan, args=(app.app_context(), mode, days, playlist_id))
        thread.daemon = True
        thread.start()

    @staticmethod
    def check_all_channels():
        # Keep old method for backward compatibility or simple triggers
        channels = Channel.query.all()
        for channel in channels:
            HealthCheckService.check_stream(channel.id)
        return len(channels)
