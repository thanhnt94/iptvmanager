from app import create_app
from app.modules.channels.models import Channel
from app.modules.auth.models import User
from flask import url_for

app = create_app()
with app.app_context():
    print("--- User Check ---")
    admin = User.query.filter_by(username='admin').first()
    if admin:
        print(f"Admin Token: {admin.api_token}")
    else:
        print("Admin user not found!")

    print("\n--- Channel Search (Miin/Min) ---")
    channels = Channel.query.filter(Channel.name.ilike('%min%')).all()
    for c in channels:
        print(f"ID: {c.id}, Name: {c.name}, Group: {c.group_name}")

    print("\n--- Unique Groups ---")
    from app.core.database import db
    groups = db.session.query(Channel.group_name).distinct().all()
    for g in groups:
        print(f"- {g[0]}")

    print("\n--- URL Mapping Example ---")
    if channels:
        c = channels[0]
        token = admin.api_token if admin else "MISSING"
        # We need a request context for url_for with _external=True
        with app.test_request_context():
            print(f"Smartlink for {c.name}: {url_for('channels.play_channel', channel_id=c.id, token=token, _external=True)}")
