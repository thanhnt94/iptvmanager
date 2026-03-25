import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app import create_app
from app.core.database import db
from app.modules.channels.models import Channel

def update_channels():
    app = create_app()
    with app.app_context():
        try:
            count = db.session.query(Channel).update({Channel.proxy_type: 'default'})
            db.session.commit()
            print(f"Successfully updated {count} channels to 'default' mode.")
        except Exception as e:
            db.session.rollback()
            print(f"Error: {e}")

if __name__ == "__main__":
    update_channels()
