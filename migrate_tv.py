import os
import sys

# Add current directory to python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionFactory
from app.modules.auth.models import User
from app.modules.channels.models import Channel
from sqlalchemy import select, update, or_

def main():
    db = SessionFactory()
    try:
        # Find admin user
        admin_res = db.execute(select(User).where(or_(User.role == 'admin', User.username == 'admin')).order_by(User.id.asc()))
        admin = admin_res.scalar_one_or_none()
        
        if not admin:
            print("[-] No admin user found in database. Cannot run migration.")
            return

        print(f"[+] Found Admin User: ID={admin.id}, Username={admin.username}")
        
        # Set all channels uploaded by admin (or without owner_id) to private
        stmt = (
            update(Channel)
            .where(or_(Channel.owner_id == admin.id, Channel.owner_id.is_(None)))
            .values(is_public=False, public_status='none', owner_id=admin.id)
        )
        result = db.execute(stmt)
        db.commit()
        print(f"[+] Successfully migrated {result.rowcount} admin channels to private.")
        
    except Exception as e:
        db.rollback()
        print(f"[-] Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
