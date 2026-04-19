
from app import create_app
from app.modules.channels.models import Channel
from app.modules.playlists.models import PlaylistProfile
from app.modules.auth.models import User

app = create_app()
with app.app_context():
    print(f"Channels: {Channel.query.count()}")
    print(f"Playlists: {PlaylistProfile.query.count()}")
    print(f"Users: {User.query.count()}")
    
    ps = PlaylistProfile.query.all()
    for p in ps:
        print(f"Playlist: {p.name} (id: {p.id}, entries: {len(p.entries)})")

    cs = Channel.query.limit(5).all()
    for c in cs:
        print(f"Channel: {c.name} (id: {c.id}, status: {c.status})")
