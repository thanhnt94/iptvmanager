import sqlite3
import os

# Database path (relative to Ecosystem root)
# Current file is in Ecosystem/IPTV/patch_passthrough.py
db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Storage', 'database', 'IPTVManager.db'))

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

print(f"Patching database for Passthrough Mode: {db_path}")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute('ALTER TABLE channels ADD COLUMN is_passthrough BOOLEAN DEFAULT 0')
    print("Added column: is_passthrough to channels table")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("Column is_passthrough already exists in channels table.")
    else:
        print(f"Error adding is_passthrough: {e}")

conn.commit()
conn.close()
print("Database successfully patched!")
