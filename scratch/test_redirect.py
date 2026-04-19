import requests

# Test without session
res = requests.get('http://127.0.0.1:5030/api/playlists', allow_redirects=False)
print(f"GET /api/playlists (no slash): {res.status_code}")
if 'Location' in res.headers:
    print(f" Redirect to: {res.headers['Location']}")

res = requests.get('http://127.0.0.1:5030/api/playlists/', allow_redirects=False)
print(f"GET /api/playlists/ (with slash): {res.status_code}")
if 'Location' in res.headers:
    print(f" Redirect to: {res.headers['Location']}")
