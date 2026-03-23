import subprocess
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

class StreamManager:
    """
    TVHeadend-style Singleton Stream Manager.
    Ensures one connection per source URL and manages broadcast to multiple clients.
    """
    _streams = {} # { url: { thread, clients: [queues], last_active } }
    _lock = threading.Lock()

    @classmethod
    def get_source_stream(cls, url, headers=None):
        with cls._lock:
            if url not in cls._streams:
                print(f"StreamManager: [NEW] Opening source link for {url}")
                cls._streams[url] = {
                    'clients': [],
                    'thread': threading.Thread(target=cls._run_source_pipe, args=(url, headers), daemon=True),
                    'active': True
                }
                cls._streams[url]['thread'].start()
            
            # Create a dedicated queue for THIS browser client
            q = queue.Queue(maxsize=100) # ~6.4MB buffer
            cls._streams[url]['clients'].append(q)
            return q

    @classmethod
    def _run_source_pipe(cls, url, headers):
        session = requests.Session()
        while True:
            # Cleanup check: Any clients left?
            with cls._lock:
                if not cls._streams[url]['clients']:
                    print(f"StreamManager: [CLEANUP] No clients left for {url}. Closing source.")
                    del cls._streams[url]
                    return

            try:
                # Use stream=True to get a real-time stream
                with session.get(url, headers=headers, stream=True, timeout=15) as r:
                    if r.status_code >= 400:
                        time.sleep(2)
                        continue
                    
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if not chunk: break
                        
                        # Dispatch chunk to ALL active clients
                        with cls._lock:
                            if url not in cls._streams: return
                            
                            # Broadcast
                            for q in cls._streams[url]['clients'][:]:
                                try:
                                    # If queue is full, drop chunk for THIS client to prevent memory leak
                                    if not q.full():
                                        q.put_nowait(chunk)
                                except:
                                    pass
            except Exception as e:
                print(f"StreamManager Error for {url}: {e}")
                time.sleep(1)

    @classmethod
    def remove_client(cls, url, q):
        with cls._lock:
            if url in cls._streams:
                if q in cls._streams[url]['clients']:
                    cls._streams[url]['clients'].remove(q)

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
                         status_filter=None, quality_filter=None, res_filter=None, audio_filter=None, sort=None):
        query = Channel.query
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
            stream_format=stream_format
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
        
        db.session.commit()
        return channel

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
            '--format', 'best', # Or try 'all' if we want many? --get-url --all-formats is slow. 
                                # Let's stay with the 'best' one first.
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            web_url
        ]
        
        try:
            import subprocess
            y_res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if y_res.returncode == 0:
                for line in y_res.stdout.strip().split('\n'):
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
            resp = requests.get(web_url, timeout=10, headers=headers)
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

import time
import threading
import queue

class StreamManager:
    """
    TVHeadend-style Singleton Stream Manager.
    Ensures one connection per source URL and manages broadcast to multiple clients.
    """
    _streams = {} # { url: { thread, clients: [queues], last_active } }
    _lock = threading.Lock()

    @classmethod
    def get_source_stream(cls, url, headers=None):
        with cls._lock:
            if url not in cls._streams:
                print(f"StreamManager: [NEW] Opening source link for {url}")
                cls._streams[url] = {
                    'clients': [],
                    'thread': threading.Thread(target=cls._run_source_pipe, args=(url, headers), daemon=True),
                    'active': True
                }
                cls._streams[url]['thread'].start()
            
            # Create a dedicated queue for THIS browser client
            q = queue.Queue(maxsize=100) # ~6.4MB buffer
            cls._streams[url]['clients'].append(q)
            return q

    @classmethod
    def _run_source_pipe(cls, url, headers):
        session = requests.Session()
        while True:
            # Cleanup check: Any clients left?
            with cls._lock:
                if not cls._streams[url]['clients']:
                    print(f"StreamManager: [CLEANUP] No clients left for {url}. Closing source.")
                    del cls._streams[url]
                    return

            try:
                # Use stream=True to get a real-time stream
                with session.get(url, headers=headers, stream=True, timeout=15) as r:
                    if r.status_code >= 400:
                        time.sleep(2)
                        continue
                    
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if not chunk: break
                        
                        # Dispatch chunk to ALL active clients
                        with cls._lock:
                            if url not in cls._streams: return
                            
                            # Broadcast
                            for q in cls._streams[url]['clients'][:]:
                                try:
                                    # If queue is full, drop chunk for THIS client to prevent memory leak
                                    if not q.full():
                                        q.put_nowait(chunk)
                                except:
                                    pass
            except Exception as e:
                print(f"StreamManager Error for {url}: {e}")
                time.sleep(1)

    @classmethod
    def remove_client(cls, url, q):
        with cls._lock:
            if url in cls._streams:
                if q in cls._streams[url]['clients']:
                    cls._streams[url]['clients'].remove(q)

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

