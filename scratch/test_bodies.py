import requests

# Test without session
res = requests.get('http://127.0.0.1:5030/api/playlists', allow_redirects=False)
print(f"GET /api/playlists: {res.status_code}")
print(f"Body: {res.text[:100]}")

res = requests.get('http://127.0.0.1:5030/api/nonexistent', allow_redirects=False)
print(f"GET /api/nonexistent: {res.status_code}")
print(f"Body: {res.text[:100]}")
