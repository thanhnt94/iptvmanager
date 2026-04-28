from app import create_app
from app.modules.auth.models import User
from app.modules.playlists.models import PlaylistProfile
from app.core.database import db

app = create_app()
with app.app_context():
    t = 'c880546ee79bf09453a3475038ae6623'
    print(f"--- Searching for Token: {t} ---")
    
    u = User.query.filter_by(api_token=t).first()
    if u:
        print(f"MATCH FOUND in User: {u.username} (ID: {u.id}, Role: {u.role})")
    else:
        print("Not found in Users.")
        
    p = PlaylistProfile.query.filter_by(security_token=t).first()
    if p:
        print(f"MATCH FOUND in Playlist: {p.name} (ID: {p.id}, Owner: {p.owner_id})")
    else:
        print("Not found in Playlists.")
