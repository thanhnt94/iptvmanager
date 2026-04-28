from app import create_app
from app.modules.channels.models import Channel
from app.modules.playlists.models import PlaylistProfile
from app.core.database import db

app = create_app()
with app.app_context():
    print("--- Database Check ---")
    total = Channel.query.count()
    print(f"Total channels in DB: {total}")
    
    user1_channels = Channel.query.filter_by(owner_id=1).count()
    print(f"Channels owned by user 1: {user1_channels}")
    
    public_channels = Channel.query.filter_by(is_public=True).count()
    print(f"Public channels: {public_channels}")
    
    unknown_owner = Channel.query.filter(Channel.owner_id == None).count()
    print(f"Channels with NO owner: {unknown_owner}")
    
    profile = PlaylistProfile.query.filter_by(slug='user-1-all').first()
    if profile:
        print(f"Profile 'user-1-all' found. Owner: {profile.owner_id}")
    else:
        print("Profile 'user-1-all' NOT found!")
