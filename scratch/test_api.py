import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app import create_app
from app.modules.auth.models import User
from app.core.database import db
from flask import url_for

app = create_app()
with app.app_context():
    # 1. Let's find a user to "log in" as
    user = User.query.filter_by(username='admin').first()
    if not user:
        print("Admin user not found, creating one...")
        user = User(username='admin', role='admin', email='admin@example.com')
        user.set_password('admin')
        db.session.add(user)
        db.session.commit()
    
    # 2. Test the playlists API
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['_user_id'] = user.id
            sess['_fresh'] = True
        
        print("\n--- Testing /api/playlists/ ---")
        res = client.get('/api/playlists/')
        print(f"Status: {res.status_code}")
        print(f"Data: {res.get_data(as_text=True)}")
        
        print("\n--- Testing /api/playlists/entries/0 ---")
        res = client.get('/api/playlists/entries/0?limit=5')
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            data = res.get_json()
            print(f"Channel Count: {len(data.get('channels', []))}")
            if data.get('channels'):
                 print(f"Sample Channel: {data['channels'][0]['name']} -> {data['channels'][0]['play_url']}")
        else:
            print(f"Error: {res.get_data(as_text=True)}")

        print("\n--- Testing /api/playlists/groups/0 ---")
        res = client.get('/api/playlists/groups/0')
        print(f"Status: {res.status_code}")
        print(f"Data: {res.get_json()}")
