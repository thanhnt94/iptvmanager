import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app import create_app
from app.core.database import db
from app.modules.playlists.models import PlaylistProfile
from app.modules.playlists.services import PlaylistService
from app.modules.auth.models import User

app = create_app()

def migrate():
    with app.app_context():
        print("Starting playlist migration...")
        
        # 1. Ensure Global System Playlists (like 'public')
        PlaylistService.ensure_global_system_playlists()
        
        # 2. Delete redundant global legacy system playlists
        # These are usually slug='alliptv' or slug='protected' with owner_id=None
        legacy_slugs = ['alliptv', 'protected']
        redundant = PlaylistProfile.query.filter(
            PlaylistProfile.slug.in_(legacy_slugs),
            PlaylistProfile.owner_id == None,
            PlaylistProfile.is_system == True
        ).all()
        
        for p in redundant:
            print(f"Removing legacy global playlist: {p.slug} (ID: {p.id})")
            db.session.delete(p)
        
        # 3. Ensure all users have their personal system playlists
        users = User.query.all()
        for user in users:
            print(f"Ensuring default playlists for user: {user.username} (ID: {user.id})")
            PlaylistService.ensure_user_default_playlists(user)
            
        db.session.commit()
        print("Migration completed successfully.")

if __name__ == "__main__":
    migrate()
