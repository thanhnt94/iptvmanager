import sqlite3
import os

# Database path for IPTV
DB_PATH = r"c:\Code\Ecosystem\Storage\database\IPTVManager.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'central_auth_id' not in columns:
            print("Adding 'central_auth_id' column to 'users' table...")
            cursor.execute("ALTER TABLE users ADD COLUMN central_auth_id VARCHAR(36)")
            # Add index
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_users_central_auth_id ON users (central_auth_id)")
            conn.commit()
            print("Migration successful: 'central_auth_id' added to IPTV.")
        else:
            print("Column 'central_auth_id' already exists in IPTV.")

        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == '__main__':
    migrate()
