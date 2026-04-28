from app import create_app
from app.modules.channels.models import Channel
from app.core.database import db
from sqlalchemy import func

app = create_app()
with app.app_context():
    print("--- Channel Status Stats (Owner 1) ---")
    stats = db.session.query(Channel.status, func.count(Channel.id)).filter(Channel.owner_id == 1).group_by(Channel.status).all()
    for s in stats:
        print(f"Status: {s[0]} | Count: {s[1]}")
    
    total = Channel.query.filter_by(owner_id=1).count()
    print(f"Total Channels for Owner 1: {total}")
