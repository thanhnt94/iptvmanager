import sys
import os
sys.path.append(os.getcwd())
from app import create_app
from app.core.database import db
from app.modules.playlists.models import PlaylistProfile

app = create_app()

def cleanup():
    with app.app_context():
        print("Starting FINAL cleanup of legacy system playlists...")
        
        # We only want 'public' and 'user-[id]-all/protected'
        # 'alliptv' and 'protected' are legacy global slugs (now owned by admin but redundant)
        legacy_slugs = ['alliptv', 'protected']
        
        legacy_playlists = PlaylistProfile.query.filter(
            PlaylistProfile.slug.in_(legacy_slugs)
        ).all()
        
        if not legacy_playlists:
            print("No legacy playlists found by slug.")
            return

        for p in legacy_playlists:
            print(f"FORCING deletion of legacy playlist: {p.name} (Slug: {p.slug}, ID: {p.id})")
            db.session.delete(p)
            
        db.session.commit()
        print("Final Cleanup completed successfully.")

if __name__ == "__main__":
    cleanup()
