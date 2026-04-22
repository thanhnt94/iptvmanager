import sys
import os
sys.path.append(os.getcwd())
from app import create_app
from app.modules.playlists.models import PlaylistProfile
app = create_app()
with app.app_context():
    print("--- SYSTEM PLAYLISTS ---")
    for p in PlaylistProfile.query.filter_by(is_system=True).all():
        print(f"ID: {p.id} | Slug: {p.slug} | Name: {p.name} | Owner: {p.owner_id}")
