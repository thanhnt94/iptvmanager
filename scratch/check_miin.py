from app import create_app
from app.modules.channels.models import Channel
from app.core.database import db

app = create_app()
with app.app_context():
    print("--- Searching for Miin/Min in Channels ---")
    channels = Channel.query.filter(Channel.name.ilike('%min%')).all()
    for c in channels:
        print(f"ID: {c.id}, Name: {c.name}, Group: {c.group_name}")
    
    print("\n--- All Unique Groups ---")
    groups = db.session.query(Channel.group_name).distinct().all()
    for g in groups:
        print(f"- {g[0]}")
