import os
import sys
import sqlite3

# Add current directory to python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionFactory
from app.modules.auth.models import User
from app.modules.channels.models import Channel
from sqlalchemy import select, update, or_, text

def main():
    db = SessionFactory()
    
    # 1. Update SQLite Schema directly
    conn = None
    try:
        from app.core.config import Config
        db_path = Config.DB_PATH
        if os.path.exists(db_path):
            print(f"[+] Connecting directly to SQLite DB at: {db_path}")
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Add custom_name to playlist_entries if not exists
            try:
                cursor.execute("ALTER TABLE playlist_entries ADD COLUMN custom_name VARCHAR(255)")
                conn.commit()
                print("[+] Added custom_name column to playlist_entries.")
            except Exception as e:
                print(f"[~] custom_name column check: {e}")
                
            # Add owner_id to channels if not exists
            try:
                cursor.execute("ALTER TABLE channels ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
                conn.commit()
                print("[+] Checked/Added owner_id column to channels.")
            except Exception as e:
                print(f"[~] owner_id column check: {e}")
                
    except Exception as e:
        print(f"[-] SQLite direct alter error: {e}")
    finally:
        if conn:
            conn.close()

    try:
        # 2. Find admin user
        admin_res = db.execute(select(User).where(or_(User.role == 'admin', User.username == 'admin')).order_by(User.id.asc()))
        admin = admin_res.scalar_one_or_none()
        
        if not admin:
            print("[-] No admin user found in database. Cannot run data updates.")
            return

        print(f"[+] Found Admin User: ID={admin.id}, Username={admin.username}")
        
        # 3. Set all channels uploaded by admin (or without owner_id) to private
        stmt = (
            update(Channel)
            .where(or_(Channel.owner_id == admin.id, Channel.owner_id.is_(None)))
            .values(is_public=False, public_status='none', owner_id=admin.id)
        )
        result = db.execute(stmt)
        print(f"[+] Successfully migrated {result.rowcount} admin channels to private.")
        
        # 4. Truncate existing playlists data
        print("[+] Clearing existing playlist profiles, groups, and entries to start fresh...")
        db.execute(text("DELETE FROM playlist_entries"))
        db.execute(text("DELETE FROM playlist_groups"))
        db.execute(text("DELETE FROM playlist_profiles"))
        
        db.commit()
        print("[+] Migration and cleanup completed successfully.")
        
    except Exception as e:
        db.rollback()
        print(f"[-] Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
