import sqlite3
import os
import sys

# Add root to path for imports if needed, though we can just do raw sqlite
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
db_path = os.path.abspath(os.path.join(basedir, 'Storage', 'database', 'IPTVManager.db'))

def migrate():
    print(f"Connecting to database at {db_path}...")
    if not os.path.exists(db_path):
        print("Database file not found!")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        print("Checking for 'owner_id' in 'playlist_profiles' table...")
        cursor.execute("PRAGMA table_info(playlist_profiles)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'owner_id' not in columns:
            print("Adding 'owner_id' column to 'playlist_profiles'...")
            cursor.execute("ALTER TABLE playlist_profiles ADD COLUMN owner_id INTEGER REFERENCES users(id)")
            print("Set default owner_id=1 for existing playlists...")
            cursor.execute("UPDATE playlist_profiles SET owner_id = 1")
            print("Column added and updated successfully.")
        else:
            print("Column 'owner_id' already exists.")

        # Also ensuring any missing default data for system playlists
        print("Migration complete.")
        conn.commit()
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
