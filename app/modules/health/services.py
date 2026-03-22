import requests
import subprocess
import json
from datetime import datetime
from app.modules.channels.models import Channel
from app.core.database import db

class HealthCheckService:
    @staticmethod
    def check_stream(channel_id):
        """Checks the connectivity and technical specs of a single stream URL."""
        channel = Channel.query.get(channel_id)
        if not channel:
            return
            
        try:
            # Measure latency
            start_time = datetime.utcnow()
            # Try a quick HEAD first to see if it pings
            try:
                response = requests.head(channel.stream_url, timeout=5, allow_redirects=True)
                latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                ping_ok = response.status_code < 400
            except:
                ping_ok = False
                latency = None

            if ping_ok:
                channel.latency = latency
                if latency < 500: channel.quality = 'excellent'
                elif latency < 1500: channel.quality = 'good'
                else: channel.quality = 'poor'
            
            # Use ffprobe as the source of truth for "Live" (must have actual media)
            success = HealthCheckService._update_stream_specs(channel)
            
            if success:
                channel.status = 'live'
            else:
                channel.status = 'die'
                channel.quality = None
                channel.latency = None
                
        except Exception as e:
            print(f"Check error for {channel.name}: {e}")
            channel.status = 'die'
            
        channel.last_checked_at = datetime.utcnow()
        db.session.commit()

    @staticmethod
    def _update_stream_specs(channel):
        """Uses ffprobe to extract resolution, audio info, and detect VOD vs LIVE.
        Returns True if at least one stream is found, False otherwise."""
        cmd = [
            'ffprobe', '-v', 'quiet', 
            '-print_format', 'json', 
            '-show_streams', '-show_format',
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '-probesize', '5000000', 
            '-analyzeduration', '5000000',
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
                try:
                    if duration and float(duration) > 0:
                        channel.stream_type = 'vod'
                    else:
                        channel.stream_type = 'live'
                except:
                    channel.stream_type = 'live'

                for stream in streams:
                    if stream.get('codec_type') == 'video':
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
        'stop_requested': False
    }

    @staticmethod
    def get_status():
        return HealthCheckService._scan_state

    @staticmethod
    def stop_scan():
        HealthCheckService._scan_state['stop_requested'] = True

    @staticmethod
    def start_background_scan(app, mode='all', days=None):
        """Starts the scanning process in a background thread."""
        if HealthCheckService._scan_state['is_running']:
            return
            
        def run_scan(app_context, mode, days):
            with app_context:
                HealthCheckService._scan_state['is_running'] = True
                HealthCheckService._scan_state['stop_requested'] = False
                HealthCheckService._scan_state['current'] = 0
                
                query = Channel.query
                
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
                    HealthCheckService.check_stream(channel.id)
                    HealthCheckService._scan_state['current'] += 1
                
                HealthCheckService._scan_state['is_running'] = False

        import threading
        thread = threading.Thread(target=run_scan, args=(app.app_context(), mode, days))
        thread.daemon = True
        thread.start()

    @staticmethod
    def check_all_channels():
        # Keep old method for backward compatibility or simple triggers
        channels = Channel.query.all()
        for channel in channels:
            HealthCheckService.check_stream(channel.id)
        return len(channels)
