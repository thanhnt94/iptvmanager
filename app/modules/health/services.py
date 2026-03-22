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
            response = requests.head(channel.stream_url, timeout=5, allow_redirects=True)
            latency = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            if response.status_code < 400:
                channel.status = 'live'
                channel.latency = latency
                # Determine quality based on latency
                if latency < 500:
                    channel.quality = 'excellent'
                elif latency < 1500:
                    channel.quality = 'good'
                else:
                    channel.quality = 'poor'
                
                # Tech specs
                HealthCheckService._update_stream_specs(channel)
            else:
                # Fallback to GET for deeper check
                start_time = datetime.utcnow()
                response = requests.get(channel.stream_url, timeout=5, stream=True)
                latency = (datetime.utcnow() - start_time).total_seconds() * 1000
                
                if response.status_code < 400:
                    channel.status = 'live'
                    channel.latency = latency
                    channel.quality = 'good' # Fallback usually means slower
                    HealthCheckService._update_stream_specs(channel)
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
        """Uses ffprobe to extract resolution and audio info."""
        cmd = [
            'ffprobe', '-v', 'quiet', 
            '-print_format', 'json', 
            '-show_streams', 
            '-select_streams', 'v:0,a:0',
            channel.stream_url
        ]
        
        try:
            # We must limit the time here as ffprobe can hang on weak streams
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                for stream in data.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        w = stream.get('width')
                        h = stream.get('height')
                        if w and h:
                            channel.resolution = f"{w}x{h}"
                    elif stream.get('codec_type') == 'audio':
                        channel.audio_codec = stream.get('codec_name', '').upper()
        except Exception as e:
            print(f"FFprobe specs error for {channel.name}: {e}")

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
    def start_background_scan(app):
        """Starts the scanning process in a background thread."""
        if HealthCheckService._scan_state['is_running']:
            return
            
        def run_scan(app_context):
            with app_context:
                HealthCheckService._scan_state['is_running'] = True
                HealthCheckService._scan_state['stop_requested'] = False
                HealthCheckService._scan_state['current'] = 0
                
                channels = Channel.query.all()
                HealthCheckService._scan_state['total'] = len(channels)
                
                for channel in channels:
                    if HealthCheckService._scan_state['stop_requested']:
                        break
                    HealthCheckService.check_stream(channel.id)
                    HealthCheckService._scan_state['current'] += 1
                
                HealthCheckService._scan_state['is_running'] = False

        import threading
        thread = threading.Thread(target=run_scan, args=(app.app_context(),))
        thread.daemon = True
        thread.start()

    @staticmethod
    def check_all_channels():
        # Keep old method for backward compatibility or simple triggers
        channels = Channel.query.all()
        for channel in channels:
            HealthCheckService.check_stream(channel.id)
        return len(channels)
