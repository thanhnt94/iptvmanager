import sys
import os

sys.path.append(os.getcwd())

from app import create_app
from app.core.database import db
from app.modules.playlists.models import PlaylistProfile

app = create_app()

def cleanup():
    with app.app_context():
        print("Starting cleanup of legacy system playlists...")
        
        # We only want 'public' to be global-system.
        # 'alliptv' and 'protected' are legacy now that we have per-user ones.
        legacy_slugs = ['alliptv', 'protected']
        
        # Find ANY playlist with these slugs that DOES NOT have an owner (legacy global ones)
        legacy_playlists = PlaylistProfile.query.filter(
            PlaylistProfile.slug.in_(legacy_slugs),
            PlaylistProfile.owner_id == None
        ).all()
        
        if not legacy_playlists:
            print("No legacy global playlists found.")
            return

        for p in legacy_playlists:
            print(f"Deleting legacy playlist: {p.name} (Slug: {p.slug}, ID: {p.id})")
            db.session.delete(p)
            
        db.session.commit()
        print("Cleanup completed successfully.")

if __name__ == "__main__":
    cleanup()
