import sqlite3
import os
from app.core.config import Config

db_path = Config.DB_PATH
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE tv_channels ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
        conn.commit()
        print("Migrated tv_channels successfully.")
    except Exception as e:
        print(f"Migration error (might already exist): {e}")
    conn.close()
