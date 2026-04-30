import sqlite3
import os

# Update these paths if necessary
db_path = r'c:\Code\Ecosystem\Storage\database\IPTVManager.db'

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Table: playlist_profiles
    new_playlist_cols = [
        ('is_dynamic', 'BOOLEAN DEFAULT 0'),
        ('website_url', 'VARCHAR(512)'),
        ('scanner_type', 'VARCHAR(50) DEFAULT "generic"'),
        ('last_synced_at', 'DATETIME'),
        ('is_scanning', 'BOOLEAN DEFAULT 0'),
        ('current_scanning_name', 'VARCHAR(255)')
    ]

    for col_name, col_type in new_playlist_cols:
        try:
            cursor.execute(f"ALTER TABLE playlist_profiles ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name} to playlist_profiles")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column {col_name} already exists in playlist_profiles")
            else:
                print(f"Error adding {col_name} to playlist_profiles: {e}")

    # Table: channels
    new_channel_cols = [
        ('is_dynamic', 'BOOLEAN DEFAULT 0'),
        ('dynamic_origin_url', 'VARCHAR(512)')
    ]

    for col_name, col_type in new_channel_cols:
        try:
            cursor.execute(f"ALTER TABLE channels ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name} to channels")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column {col_name} already exists in channels")
            else:
                print(f"Error adding {col_name} to channels: {e}")

    conn.commit()
    conn.close()
    print("Migration finished.")

if __name__ == '__main__':
    migrate()
