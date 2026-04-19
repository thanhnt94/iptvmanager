from app import create_app
from app.modules.channels.models import Channel
from flask import url_for
import requests

app = create_app()
with app.app_context():
    # Pick a channel with .m3u8
    c = Channel.query.filter(Channel.stream_url.ilike('%.m3u8%')).first()
    if not c:
        print("No HLS channel found for testing.")
        exit()

    print(f"Testing Channel: {c.name}")
    print(f"Source URL: {c.stream_url}")

    with app.test_request_context():
        token = "test-token"
        
        # Simulate play_hls logic
        try:
            resp = requests.get(c.stream_url, timeout=5, verify=False)
            content = resp.text
            print("\n--- Original Manifest (First 5 lines) ---")
            print('\n'.join(content.split('\n')[:5]))
            
            # Simulate segment rewriting
            base_url = c.stream_url.rsplit('/', 1)[0]
            lines = content.split('\n')
            for line in lines:
                if not line.startswith('#') and line.strip():
                    seg_url = line.strip()
                    if not seg_url.startswith('http'):
                        seg_url = f"{base_url}/{seg_url}"
                    
                    proxy_url = url_for('channels.play_hls_direct', url=seg_url, token=token, _external=True)
                    print(f"\nExample Rewritten VARIANT Playlist URL (Corrected):\n{proxy_url}")
                    
                    # Also test a .ts line if possible
                    ts_line = "segment1.ts"
                    full_ts_url = f"{base_url}/{ts_line}"
                    proxy_ts = url_for('channels.proxy_hls_segment', token=token, url=full_ts_url, _external=True)
                    print(f"\nExample Rewritten SEGMENT URL:\n{proxy_ts}")
                    break
        except Exception as e:
            print(f"Error fetching source: {e}")
