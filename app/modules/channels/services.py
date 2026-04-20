import subprocess
import shutil
import xml.etree.ElementTree as ET
from datetime import datetime
import os
import logging
import requests
import re
from app.modules.channels.models import Channel, EPGSource, EPGData
from app.core.database import db

logger = logging.getLogger('iptv')

import time
import threading
import queue
import psutil

from collections import deque

class StreamManager:
    """
    Advanced IPTV Proxy Engine for Armbian/Linux.
    Features: 
    - Singleton connection (1 source link = 1 bandwidth usage).
    - Circular RAM Buffer (Pre-fills data to prevent lag).
    - Burst-delivery for new clients (Instant playback).
    """
    _streams = {} # { sid: { thread, clients: [queues], buffer: deque, lock } }
    _lock = threading.Lock()

    @classmethod
    def get_source_stream(cls, url, headers=None, **kwargs):
        from app.modules.settings.services import SettingService
        use_sm = SettingService.get('ENABLE_STREAM_MANAGER', True)
        # Load dynamic buffer size
        ts_buffer_size = SettingService.get('TS_BUFFER_SIZE', 512) # 512 * 4KB = 2MB
        with cls._lock:
            # Detect if we need FFmpeg (Transcode/Remux)
            is_flv = '.flv' in url.lower().split('?')[0]
            force_transcode = kwargs.get('transcode', False)
            
            sid = url if use_sm else f"{url}_{time.time()}"
            if force_transcode: sid = f"trans_{sid.replace('trans_', '')}"
            
            # Create a new client queue
            # Increased size to 256 for better depth and fewer drops
            q = queue.Queue(maxsize=256) 
            
            if sid not in cls._streams:
                target = cls._run_ffmpeg_pipe if force_transcode else cls._run_source_pipe
                cls._streams[sid] = {
                    'clients': [q], # Add first client BEFORE starting thread
                    'buffer': deque(maxlen=ts_buffer_size),
                    'thread': threading.Thread(target=target, args=(url, headers, sid), daemon=True),
                    'lock': threading.Lock(),
                    'last_client_at': time.time()
                }
                cls._streams[sid]['thread'].start()
            else:
                # PRE-FILL (Burst-start): Fill the new client's queue with historical data from RAM
                with cls._streams[sid]['lock']:
                    for chunk in cls._streams[sid]['buffer']:
                        try:
                            q.put_nowait(chunk)
                        except:
                            break
                    
                    cls._streams[sid]['clients'].append(q)
                    cls._streams[sid]['last_client_at'] = time.time()
                
            return q, sid

    @classmethod
    def _run_source_pipe(cls, url, headers, sid):
        logger.info(f"StreamEngine: Starting optimized pipe for {url}")
        session = requests.Session()
        
        # User Agent & Referer optimization for IPTV providers
        if not headers or 'User-Agent' not in headers:
            if not headers: headers = {}
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            if 'Referer' not in headers:
                headers['Referer'] = url.rsplit('/', 1)[0] + '/' if '/' in url else url
        
        # Ensure persistent connection
        headers['Connection'] = 'keep-alive'

        while True:
            # Cleanup check with 5s grace period
            with cls._lock:
                if sid in cls._streams:
                    clients = cls._streams[sid]['clients']
                    if not clients:
                        last_active = cls._streams[sid].get('last_client_at', 0)
                        if time.time() - last_active > 5:
                            logger.info(f"StreamEngine: No clients for {sid} after 5s grace, releasing resources.")
                            del cls._streams[sid]
                            return
                    else:
                        cls._streams[sid]['last_client_at'] = time.time()
                else:
                    return

            try:
                # Use a larger stream buffer for stability
                with session.get(url, headers=headers, stream=True, timeout=60) as r:
                    if r.status_code >= 400:
                        logger.error(f"StreamEngine: Source error {r.status_code}")
                        time.sleep(5)
                        continue
                    
                    # 128KB chunks for better stability and lower CPU overhead
                    for chunk in r.iter_content(chunk_size=131072): 
                        if not chunk: break
                        
                        with cls._lock:
                            if sid not in cls._streams: break
                            
                            # Update RAM Buffer
                            cls._streams[sid]['buffer'].append(chunk)
                            
                            # Distribute to all connected clients
                            with cls._streams[sid]['lock']:
                                clients = cls._streams[sid]['clients'][:]
                                is_single_client = len(clients) == 1
                                
                                for q in clients:
                                    try:
                                        if is_single_client:
                                            # Case A0: Single client - Block longer to apply TCP Backpressure to source
                                            # We don't want to drop packets for 1 guy, we want the source to slow down.
                                            q.put(chunk, timeout=15.0)
                                        else:
                                            # Case B0: Multiple clients - Short block, drop block if full
                                            try:
                                                q.put(chunk, timeout=0.1)
                                            except queue.Full:
                                                # "Smart Drop": Evict 20% of queue at once (continuity-error aware)
                                                # Helping player to catch up and re-sync faster
                                                drop_count = max(1, q.maxsize // 5)
                                                for _ in range(drop_count):
                                                    try: q.get_nowait()
                                                    except: break
                                                q.put_nowait(chunk)
                                    except Exception:
                                        # Client likely disconnected during loop
                                        pass
            except Exception as e:
                logger.error(f"StreamEngine: Connection lost for {url}: {e}")
                time.sleep(2) # Auto-reconnect after 2s

    @classmethod
    def _run_ffmpeg_pipe(cls, url, headers, sid):
        from app.modules.settings.services import SettingService
        ffmpeg_bin = SettingService.get('FFMPEG_PATH', 'ffmpeg')
        
        # Robust path discovery
        ffmpeg_path = shutil.which(ffmpeg_bin)
        if not ffmpeg_path:
            logger.error(f"StreamEngine: FFmpeg binary not found: {ffmpeg_bin}. Please install FFmpeg or set FFMPEG_PATH.")
            with cls._lock:
                if sid in cls._streams: del cls._streams[sid]
            return

        logger.info(f"StreamEngine: Starting FFmpeg remuxer ({ffmpeg_path}) for {url}")
        
        ua = headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36') if headers else 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        referer = headers.get('Referer', url.rsplit('/', 1)[0] + '/' if '/' in url else url) if headers else (url.rsplit('/', 1)[0] + '/' if '/' in url else url)
        
        # FFmpeg headers need to be newline separated
        ffmpeg_headers = f"User-Agent: {ua}\r\nReferer: {referer}\r\n"
        
        cmd = [
            ffmpeg_path, '-y',
            '-headers', ffmpeg_headers,
            '-loglevel', 'error',
            '-i', url,
            '-map', '0',
            '-f', 'mpegts',
            '-c', 'copy',
            '-bsf:v', 'h264_mp4toannexb',
            'pipe:1'
        ]
        
        process = None
        try:
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=10**6)
            
            while True:
                # Cleanup check with 5s grace period
                with cls._lock:
                    if sid in cls._streams:
                        clients = cls._streams[sid]['clients']
                        if not clients:
                            last_active = cls._streams[sid].get('last_client_at', 0)
                            if time.time() - last_active > 5:
                                logger.info(f"StreamEngine (FFmpeg): No clients for {sid} after 5s grace, stopping.")
                                break
                        else:
                            cls._streams[sid]['last_client_at'] = time.time()
                    else:
                        break

                # Read from FFmpeg stdout
                chunk = process.stdout.read(131072) # 128KB
                if not chunk:
                    if process.poll() is not None:
                        err = process.stderr.read().decode('utf-8', 'ignore')
                        logger.error(f"StreamEngine (FFmpeg) died: {err}")
                        break
                    time.sleep(0.1)
                    continue
                
                with cls._lock:
                    if sid not in cls._streams: break
                    cls._streams[sid]['buffer'].append(chunk)
                    
                    with cls._streams[sid]['lock']:
                        clients = cls._streams[sid]['clients'][:]
                        for q in clients:
                            try:
                                q.put(chunk, timeout=0.1)
                            except:
                                pass
        except Exception as e:
            logger.error(f"StreamEngine (FFmpeg) error: {e}")
        finally:
            if process:
                try: process.terminate()
                except: pass
            
            with cls._lock:
                if sid in cls._streams: del cls._streams[sid]
            logger.info(f"StreamEngine (FFmpeg): Resources released for {sid}")

    @classmethod
    def remove_client(cls, sid, q):
        with cls._lock:
            if sid in cls._streams:
                if q in cls._streams[sid]['clients']:
                    cls._streams[sid]['clients'].remove(q)

class ActiveSessionManager:
    """
    Real-time session tracker for both Proxy and Web Players.
    """
    _sessions = {} # { session_key: { channel_id, user, ip, start_time, last_active, type } }
    _lock = threading.Lock()

    @classmethod
    def update_session(cls, channel_id, user_name, ip, session_type, bandwidth_kbps=0, user_agent=None):
        key = f"{channel_id}_{ip}_{session_type}"
        now = datetime.now()
        with cls._lock:
            if key not in cls._sessions:
                cls._sessions[key] = {
                    'key': key, # Store the key for UI actions
                    'channel_id': channel_id,
                    'user': user_name or 'Guest',
                    'ip': ip,
                    'start_time': now,
                    'type': session_type,
                    'source': cls._parse_user_agent(user_agent)
                }
            cls._sessions[key]['last_active'] = now
            cls._sessions[key]['bandwidth_kbps'] = max(cls._sessions[key].get('bandwidth_kbps', 0), bandwidth_kbps)
            if bandwidth_kbps > 0:
                # Real-time update
                cls._sessions[key]['bandwidth_kbps'] = bandwidth_kbps
            if user_agent:
                cls._sessions[key]['source'] = cls._parse_user_agent(user_agent)

    @classmethod
    def get_active_sessions(cls):
        now = datetime.now()
        with cls._lock:
            # Cleanup sessions older than 45s (allow some buffer)
            keys_to_del = [k for k, v in cls._sessions.items() 
                           if (now - v['last_active']).total_seconds() > 45]
            for k in keys_to_del: del cls._sessions[k]
            
            return list(cls._sessions.values())

    @classmethod
    def remove_session(cls, key):
        with cls._lock:
            if key in cls._sessions:
                del cls._sessions[key]
                return True
        return False

    @staticmethod
    def get_server_stats():
        try:
            return {
                'cpu': psutil.cpu_percent(interval=None),
                'ram': psutil.virtual_memory().percent
            }
        except:
            return {'cpu': 0, 'ram': 0}

    @staticmethod
    def _parse_user_agent(ua):
        if not ua: return 'Web Player' # Default if missing
        ua = ua.lower()
        if 'vlc' in ua: return 'VLC Player'
        if 'tivimate' in ua: return 'TiviMate'
        if 'ott' in ua: return 'OTT Navigator'
        if 'iptv smarter' in ua: return 'IPTV Smarters'
        if 'mozilla' in ua or 'chrome' in ua or 'safari' in ua: return 'Web Player'
        return 'External App'

class EPGService:
    @staticmethod
    def sync_epg(source_id):
        """Syncs EPG data from an XMLTV source."""
        source = EPGSource.query.get(source_id)
        if not source:
            return {'error': 'Source not found'}
            
        try:
            response = requests.get(source.url, timeout=30)
            response.raise_for_status()
            
            # Basic XML parsing for EPG (mapping check)
            # In a real app, this would be more complex and saved to an EPGData table
            # For now, we just update the source's last_sync_at
            source.last_sync_at = datetime.utcnow()
            db.session.commit()
            return {'status': 'success', 'last_sync': source.last_sync_at}
        except Exception as e:
            return {'error': str(e)}

class ChannelService:
    @staticmethod
    def get_all_channels(page=1, per_page=50, search=None, group_filter=None, stream_type_filter=None, 
                         status_filter=None, quality_filter=None, res_filter=None, audio_filter=None, 
                         sort=None, is_original_filter=None, format_filter=None, user=None):
        from app.modules.channels.models import ChannelShare
        
        query = Channel.query
        
        # Apply base permissions if not admin
        is_auth = user and user.is_authenticated
        is_admin = is_auth and hasattr(user, 'role') and user.role == 'admin'

        if not is_admin:
            # Subquery to find channels shared with this user and accepted
            shared_channels_subquery = db.session.query(ChannelShare.channel_id).filter(
                ChannelShare.to_user_id == user.id,
                ChannelShare.status == 'accepted'
            )
            
            # User can see: channels they own OR public channels OR channels shared with them
            query = query.filter(db.or_(
                Channel.owner_id == user.id,
                Channel.is_public == True,
                Channel.id.in_(shared_channels_subquery)
            ))
            
        if search:
            if search.isdigit():
                query = query.filter(db.or_(Channel.name.ilike(f'%{search}%'), Channel.id == int(search)))
            else:
                query = query.filter(Channel.name.ilike(f'%{search}%'))
        
        if group_filter:
            query = query.filter(Channel.group_name == group_filter)
        if stream_type_filter:
            query = query.filter(Channel.stream_type == stream_type_filter)
        if status_filter:
            query = query.filter(Channel.status == status_filter)
        if quality_filter:
            query = query.filter(Channel.quality == quality_filter)
        if res_filter:
            query = query.filter(Channel.resolution == res_filter)
        if audio_filter:
            query = query.filter(Channel.audio_codec == audio_filter)
            
        if is_original_filter == '1':
            query = query.filter(Channel.is_original == True)
        elif is_original_filter == '0':
            query = query.filter(db.or_(Channel.is_original == False, Channel.is_original == None))
            
        if format_filter:
            query = query.filter(Channel.stream_format == format_filter)
            
        # Sorting logic
        if sort == 'newest_checked':
            query = query.order_by(Channel.last_checked_at.desc().nullslast())
        elif sort == 'oldest_checked':
            query = query.order_by(Channel.last_checked_at.asc().nullslast())
        elif sort == 'ping_low':
            query = query.order_by(Channel.latency.asc().nullslast())
        elif sort == 'ping_high':
            query = query.order_by(Channel.latency.desc().nullslast())
        elif sort == 'name_asc':
            query = query.order_by(Channel.name.asc())
        elif sort == 'name_desc':
            query = query.order_by(Channel.name.desc())
        else:
            query = query.order_by(Channel.id.desc())
            
        return query.paginate(page=page, per_page=per_page, error_out=False)

    @staticmethod
    def get_distinct_groups():
        """Returns a list of all unique group names in the database."""
        groups = db.session.query(Channel.group_name).distinct().all()
        return sorted([g[0] for g in groups if g[0]])

    @staticmethod
    def get_distinct_resolutions():
        res = db.session.query(Channel.resolution).distinct().all()
        return sorted([r[0] for r in res if r[0]])

    @staticmethod
    def get_distinct_audio_codecs():
        aud = db.session.query(Channel.audio_codec).distinct().all()
        return sorted([a[0] for a in aud if a[0]])

    @staticmethod
    def get_distinct_formats(user=None):
        """Returns a list of all unique stream formats (hls, ts, etc.) in the database."""
        formats = db.session.query(Channel.stream_format).distinct().all()
        return sorted([f[0] for f in formats if f[0]])

    @staticmethod
    def create_channel(data):
        """Creates a new channel with duplicate detection."""
        stream_url = data.get('stream_url')
        
        # Duplicate check
        existing = Channel.query.filter_by(stream_url=stream_url).first()
        if existing:
            return None
            
        # Quick format detection from extension
        s_url_lower = stream_url.lower()
        stream_format = None
        if '.m3u8' in s_url_lower: stream_format = 'hls'
        elif '.mp4' in s_url_lower: stream_format = 'mp4'
        elif '.ts' in s_url_lower: stream_format = 'ts'
        elif '.mkv' in s_url_lower: stream_format = 'mkv'
        elif '.mp3' in s_url_lower: stream_format = 'mp3'

        new_channel = Channel(
            name=data.get('name'),
            stream_url=stream_url,
            logo_url=data.get('logo_url'),
            epg_id=data.get('epg_id'),
            group_name=data.get('group_name', 'Manual'),
            status='unknown',
            stream_type='unknown',
            stream_format=stream_format,
            proxy_type=data.get('proxy_type', 'none'),
            is_original=data.get('is_original') == 'true' or data.get('is_original') == '1' or data.get('is_original') == 'on',
            owner_id=data.get('owner_id')
        )
        db.session.add(new_channel)
        db.session.commit()
        
        return new_channel

    @staticmethod
    def update_channel(channel_id, data):
        """Updates an existing channel."""
        channel = Channel.query.get(channel_id)
        if not channel:
            return None
        
        channel.name = data.get('name', channel.name)
        channel.logo_url = data.get('logo_url', channel.logo_url)
        channel.group_name = data.get('group_name', channel.group_name)
        channel.epg_id = data.get('epg_id', channel.epg_id)
        channel.stream_url = data.get('stream_url', channel.stream_url)
        channel.proxy_type = data.get('proxy_type', channel.proxy_type or 'none')
        
        if 'is_original' in data:
            channel.is_original = data.get('is_original') == 'true' or data.get('is_original') == '1' or data.get('is_original') == 'on'
        else:
            # If not in data (checkbox unchecked), set to False
            channel.is_original = False
            
        # Admin public approval
        from flask_login import current_user
        if 'is_public' in data and current_user and current_user.role == 'admin':
            channel.is_public = data.get('is_public') == 'true' or data.get('is_public') == '1'
            if channel.is_public:
                channel.public_status = 'approved'
            else:
                channel.public_status = 'none'
        
        db.session.commit()
        return channel

    @staticmethod
    def get_user_channel_access(channel_id, user):
        from app.modules.channels.models import ChannelShare
        channel = Channel.query.get(channel_id)
        if practically_admin := user.role == 'admin': return 'edit', channel
        if not channel: return None, None
        
        if channel.owner_id == user.id: return 'edit', channel
        
        share = ChannelShare.query.filter_by(channel_id=channel_id, to_user_id=user.id, status='accepted').first()
        if share: return share.access_level, channel
        
        if channel.is_public: return 'read', channel
        
        return None, channel

    @staticmethod
    def play_with_vlc(url):
        """Attempts to open the URL in VLC on a Windows system."""
        # Common VLC installation paths on Windows
        vlc_paths = [
            'vlc', 
            r'C:\Program Files\VideoLAN\VLC\vlc.exe',
            r'C:\Program Files (x86)\VideoLAN\VLC\vlc.exe'
        ]
        
        for path in vlc_paths:
            try:
                # Use Popen with flags to ensure it plays immediately in the same/new instance
                subprocess.Popen([path, '--one-instance', '--started-from-file', url])
                return True
            except FileNotFoundError:
                continue
            except Exception as e:
                print(f"VLC error: {e}")
                continue
        return False

class HLSEngine:
    """
    HLS Proxy Engine with RAM Caching.
    Prevents lag by pre-downloading and caching .ts segments.
    """
    _cache = {} # { segment_url: { data, timestamp } }
    _lock = threading.Lock()

    @classmethod
    def get_segment(cls, url, headers=None):
        if not url:
            return None
            
        from app.modules.settings.services import SettingService
        now = time.time()
        
        # 1. Check Cache
        with cls._lock:
            if url in cls._cache:
                return cls._cache[url]['data']

        # 2. Cache MISS: Download from source
        try:
            if not headers:
                ua = SettingService.get('CUSTOM_USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36')
                headers = {'User-Agent': ua, 'Referer': url.rsplit('/', 1)[0] + '/'}
                
            resp = requests.get(url, headers=headers, timeout=12, verify=False)
            if resp.status_code == 200:
                data = resp.content
                
                # 3. Save to Cache
                with cls._lock:
                    cls._cache[url] = {'data': data, 'timestamp': now}
                    
                    # Periodic Cleanup check
                    if len(cls._cache) % 10 == 0:
                        cls._cleanup()
                        
                return data
            else:
                logger.error(f"HLSEngine: Source HTTP {resp.status_code} for {url}")
        except Exception as e:
            logger.error(f"HLSEngine: Fetch exception for {url}: {e}")
            
        return None

    @classmethod
    def _cleanup(cls):
        from app.modules.settings.services import SettingService
        now = time.time()
        ttl = SettingService.get('HLS_CACHE_TTL', 60)
        
        expired = [u for u, v in cls._cache.items() if now - v['timestamp'] > ttl]
        for u in expired:
            del cls._cache[u]
        
        # Emergency cleanup if still too many
        max_segments = SettingService.get('HLS_MAX_SEGMENTS', 50)
        if len(cls._cache) > max_segments:
            # Sort by timestamp and remove oldest
            sorted_cache = sorted(cls._cache.items(), key=lambda x: x[1]['timestamp'])
            to_remove = len(cls._cache) - max_segments
            for i in range(to_remove):
                del cls._cache[sorted_cache[i][0]]
                
        logger.debug(f"HLSEngine: Cleanup finished. Remaining: {len(cls._cache)}")

class ExtractorService:
    @staticmethod
    def extract_direct_url(web_url):
        """Uses both yt-dlp and regex scraping to find all media links from a webpage."""
        logger.info(f"Starting extraction for URL: {web_url}")
        results = []
        seen_urls = set()

        # 1. yt-dlp approach
        cmd = [
            'yt-dlp', 
            '--get-url', 
            '--no-playlist',
            '--format', 'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best', 
            '--no-warnings', 
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            web_url
        ]
        
        try:
            import subprocess
            y_res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if y_res.returncode == 0:
                lines = y_res.stdout.strip().split('\n')
                for line in lines:
                    u = line.strip()
                    if u and u not in seen_urls:
                        logger.debug(f"yt-dlp found: {u}")
                        results.append({'url': u, 'source': 'yt-dlp', 'type': 'Auto'})
                        seen_urls.add(u)
        except Exception as e:
            logger.error(f"yt-dlp extraction error for {web_url}: {str(e)}", exc_info=True)

        # 2. Deep Regex Scraper (very effective for finding multiple streams/ads)
        try:
            import requests
            import re
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
            resp = requests.get(web_url, timeout=5, headers=headers)
            if resp.status_code == 200:
                html = resp.text
                logger.debug(f"Scraper fetched {len(html)} bytes from {web_url}")
                # Find all potential m3u8/mp4/ts links
                patterns = [
                    r'https?://[^\s\'"<>]+?\.m3u8[^\s\'"<>]*',
                    r'https?://[^\s\'"<>]+?\.mp4[^\s\'"<>]*',
                    r'https?://[^\s\'"<>]+?\.ts[^\s\'"<>]*'
                ]
                for p in patterns:
                    found = re.findall(p, html)
                    for u in found:
                        u = u.replace('\\/', '/') # Unescape forward slashes if in JSON
                        if u not in seen_urls:
                            source = 'Scraper'
                            if any(x in u.lower() for x in ['ad', 'tvc', 'promo']):
                                source = 'Scraper (Ad?)'
                            logger.info(f"Regex found match: {u} (Source: {source})")
                            results.append({'url': u, 'source': source, 'type': 'Manual'})
                            seen_urls.add(u)
        except Exception as e:
            logger.error(f"Deep Regex Scraper error for {web_url}: {str(e)}", exc_info=True)

        if results:
            return {'success': True, 'links': results}
        return {'success': False, 'error': 'No media streams found on this page.'}


class EPGService:
    @staticmethod
    def get_sources():
        from app.modules.channels.models import EPGSource
        return EPGSource.query.all()

    @staticmethod
    def add_source(name, url):
        from app.modules.channels.models import EPGSource
        from app.core.database import db
        source = EPGSource(name=name, url=url)
        db.session.add(source)
        db.session.commit()
        return source

    @staticmethod
    def delete_source(source_id):
        from app.modules.channels.models import EPGSource
        from app.core.database import db
        source = EPGSource.query.get(source_id)
        if source:
            db.session.delete(source)
            db.session.commit()
            return True
        return False

    @staticmethod
    def sync_epg(source_id):
        from app.modules.channels.models import EPGSource, EPGData
        from app.core.database import db
        from datetime import datetime
        import requests
        import xml.etree.ElementTree as ET

        source = EPGSource.query.get(source_id)
        if not source: return {'success': False, 'error': 'Source not found'}
        
        logger.info(f"Starting EPG sync for {source.name} from {source.url}")
        try:
            resp = requests.get(source.url, timeout=60)
            if resp.status_code != 200:
                logger.error(f"EPG Fetch failed for {source.name}: HTTP {resp.status_code}")
                return {'success': False, 'error': f'HTTP {resp.status_code}'}
            
            logger.debug(f"EPG file fetched, size: {len(resp.content)} bytes")
            # Simple ET parsing
            # For large files, consider iterparse, but for now this is simpler
            root = ET.fromstring(resp.content)
            
            # Optimization: collect all channel IDs in this file
            file_channel_ids = set()
            for ch in root.findall('channel'):
                cid = ch.get('id')
                if cid: file_channel_ids.add(cid)
            
            logger.info(f"Found {len(file_channel_ids)} channels in XMLTV file.")
            # Delete old programs for those channels to avoid duplication
            if file_channel_ids:
                EPGData.query.filter(EPGData.epg_id.in_(file_channel_ids)).delete(synchronize_session=False)
            
            new_programs = []
            count = 0
            for prog in root.findall('programme'):
                epg_id = prog.get('channel')
                start_str = prog.get('start')
                stop_str = prog.get('stop')
                title_node = prog.find('title')
                
                if not epg_id or not start_str or not stop_str or title_node is None:
                    continue
                
                new_programs.append(EPGData(
                    epg_id=epg_id,
                    title=title_node.text or "No Title",
                    desc=prog.findtext('desc') or "",
                    start=EPGService._parse_xmltv_date(start_str),
                    stop=EPGService._parse_xmltv_date(stop_str)
                ))
                count += 1
                
                if len(new_programs) >= 1000:
                    db.session.bulk_save_objects(new_programs)
                    logger.debug(f"Bulk saved {count} programs...")
                    new_programs = []
            
            if new_programs:
                db.session.bulk_save_objects(new_programs)
            
            source.last_sync_at = datetime.utcnow()
            db.session.commit()
            logger.info(f"EPG sync completed for {source.name}. Total programs: {count}")
            return {'success': True, 'count': count}
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"EPG sync exception for {source.name}: {str(e)}", exc_info=True)
            return {'success': False, 'error': str(e)}

    @staticmethod
    def _parse_xmltv_date(date_str):
        from datetime import datetime
        # 20231023120000 +0000
        clean = date_str.split(' ')[0]
        return datetime.strptime(clean[:14], '%Y%m%d%H%M%S')

