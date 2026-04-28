from app import create_app
from app.modules.channels.models import Channel
from app.modules.auth.models import User
from app.core.database import db

app = create_app()
with app.app_context():
    print("--- Diagnostic Check ---")
    ch = Channel.query.get(122)
    if ch:
        print(f"Channel 122: {ch.name}")
        print(f"  Owner: {ch.owner_id}")
        print(f"  Public: {ch.is_public}")
        print(f"  Stream URL: {ch.stream_url}")
    else:
        print("Channel 122 NOT found!")
        
    token = '1f9d55d85a567d72dc7365e3e49e6a00d06a7f897c103697'
    u = User.query.filter_by(api_token=token).first()
    if u:
        print(f"User for Token: {u.username}")
        print(f"  ID: {u.id}")
        print(f"  Role: {u.role}")
    else:
        print("Token NOT found in User table!")
