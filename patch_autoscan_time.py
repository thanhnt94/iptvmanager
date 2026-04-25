import sqlite3
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Storage', 'database', 'IPTVManager.db'))

def migrate():
    print(f"Connecting to database at {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database not found! Migration failed.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(playlist_profiles)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'auto_scan_time' not in columns:
            print("Adding 'auto_scan_time' column to 'playlist_profiles' table...")
            cursor.execute("ALTER TABLE playlist_profiles ADD COLUMN auto_scan_time VARCHAR(5) DEFAULT NULL")
            conn.commit()
            print("Successfully added 'auto_scan_time'.")
        else:
            print("Column 'auto_scan_time' already exists.")
            
    except Exception as e:
        print(f"Migration error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
