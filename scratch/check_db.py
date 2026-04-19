import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app import create_app
from app.modules.playlists.models import PlaylistProfile
from app.modules.channels.models import Channel
from app.core.database import db

app = create_app()
with app.app_context():
    print(f"Total Playlists: {PlaylistProfile.query.count()}")
    playlists = PlaylistProfile.query.all()
    for p in playlists:
        print(f" - ID: {p.id}, Name: {p.name}, Slug: {p.slug}")
    
    print(f"Total Channels: {Channel.query.count()}")
    channels = Channel.query.limit(5).all()
    for c in channels:
        print(f" - ID: {c.id}, Name: {c.name}")
