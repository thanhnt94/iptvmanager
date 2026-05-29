import sqlite3
import os

db_path = r'c:\Code\Ecosystem\Storage\database\IPTVManager.db'
if not os.path.exists(db_path):
    print("Database path not found!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get list of tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print("Tables in database:", tables)

# Check if watchtogether tables exist
wt_tables = ['wt_rooms', 'wt_chat_messages', 'wt_memberships', 'wt_video_history']
for table in wt_tables:
    if table in tables:
        print(f"Table '{table}' exists.")
        cursor.execute(f"PRAGMA table_info({table});")
        print("Columns:", [col[1] for col in cursor.fetchall()])
        cursor.execute(f"SELECT * FROM {table};")
        print("Rows:", cursor.fetchall())
        cursor.execute(f"SELECT COUNT(*) FROM {table};")
        print("Rows count:", cursor.fetchone()[0])
    else:
        print(f"Table '{table}' does NOT exist!")

conn.close()
