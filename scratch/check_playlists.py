import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app import create_app
from app.modules.playlists.models import PlaylistProfile

app = create_app()
with app.app_context():
    print("--- System Playlists ---")
    profiles = PlaylistProfile.query.filter_by(is_system=True).all()
    for p in profiles:
        print(f"ID: {p.id} | Name: {p.name} | Owner: {p.owner_id} | Slug: {p.slug}")
