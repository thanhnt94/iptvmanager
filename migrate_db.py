import sqlite3
import os

db_path = r'c:\Code\IPTV\instance\iptv_manager.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    # 1. Add new column
    cur.execute("ALTER TABLE channels ADD COLUMN proxy_type VARCHAR(20) DEFAULT 'default'")
    print("Added proxy_type column")
    
    # 2. Migrate existing data (if use_proxy was True, set to tvheadend)
    # Note: If use_proxy column still exists, we can migrate it.
    try:
        cur.execute("UPDATE channels SET proxy_type = 'tvheadend' WHERE use_proxy = 1")
        print("Migrated existing use_proxy data")
    except sqlite3.OperationalError:
        print("use_proxy column not found, skipping migration")
        
    conn.commit()
    print("Database migration successful.")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
