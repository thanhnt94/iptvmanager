import sqlite3
import os

db_path = r'c:\Code\IPTV\instance\iptv_manager.db'

def migrate():
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    columns = [
        ('video_codec', 'VARCHAR(50)'),
        ('bitrate', 'INTEGER'),
        ('error_message', 'TEXT')
    ]
    
    for col_name, col_type in columns:
        try:
            cursor.execute(f"ALTER TABLE channels ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column {col_name} already exists")
            else:
                print(f"Error adding {col_name}: {e}")
                
    conn.commit()
    conn.close()
    print("Migration complete")

if __name__ == "__main__":
    migrate()
