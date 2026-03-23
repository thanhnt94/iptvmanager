import time
import threading
import queue
import logging
import requests
from flask import Response, stream_with_context, redirect

logger = logging.getLogger('iptv')

class StreamManager:
    """
    TVHeadend-style Singleton Stream Manager.
    Ensures one connection per source URL and manages broadcast to multiple clients.
    """
    _streams = {} # { url: { thread, clients: [queues], active } }
    _lock = threading.Lock()

    @classmethod
    def get_source_stream(cls, url, headers=None):
        with cls._lock:
            if url not in cls._streams:
                logger.info(f"StreamManager: [NEW] Opening source link for {url}")
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
                if url not in cls._streams: return
                if not cls._streams[url]['clients']:
                    logger.info(f"StreamManager: [CLEANUP] No clients left for {url}. Closing source.")
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
                                    if not q.full():
                                        q.put_nowait(chunk)
                                except:
                                    pass
            except Exception as e:
                logger.error(f"StreamManager Error for {url}: {e}")
                time.sleep(1)

    @classmethod
    def remove_client(cls, url, q):
        with cls._lock:
            if url in cls._streams:
                if q in cls._streams[url]['clients']:
                    cls._streams[url]['clients'].remove(q)

class StreamService:
    """
    High-level service to manage different streaming strategies.
    """
    @staticmethod
    def get_stream_response(url, format_type='ts', use_proxy=False, headers=None):
        """
        Returns either a direct redirect or a proxied Response object.
        """
        if not use_proxy:
            return redirect(url)

        # Determine content type based on format
        content_types = {
            'hls': 'application/vnd.apple.mpegurl',
            'mp4': 'video/mp4',
            'ts': 'video/mp2t',
            'mkv': 'video/x-matroska'
        }
        content_type = content_types.get(format_type.lower(), 'video/mp2t')

        def generate():
            q = StreamManager.get_source_stream(url, headers)
            try:
                while True:
                    try:
                        chunk = q.get(timeout=20) 
                        if chunk is None: break
                        yield chunk
                    except queue.Empty:
                        # Source might be slow, keep trying
                        continue
            finally:
                StreamManager.remove_client(url, q)

        return Response(stream_with_context(generate()), content_type=content_type)
