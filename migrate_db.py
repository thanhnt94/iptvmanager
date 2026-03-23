import os
import sys

# Thêm thư mục gốc vào path để import được app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

from app import create_app
from app.core.database import db
from sqlalchemy import text, inspect

def migrate():
    app = create_app()
    with app.app_context():
        engine = db.engine
        inspector = inspect(engine)
        columns = [c['name'] for c in inspector.get_columns('channels')]
        
        print("Checking for missing columns in 'channels' table...")
        
        # Danh sách các cột cần thêm
        new_columns = [
            ('play_count', 'INTEGER DEFAULT 0'),
            ('total_watch_seconds', 'INTEGER DEFAULT 0'),
            ('total_bandwidth_mb', 'FLOAT DEFAULT 0.0'),
            ('stream_format', 'VARCHAR(20)')
        ]
        
        added_count = 0
        with engine.connect() as conn:
            for col_name, col_type in new_columns:
                if col_name not in columns:
                    print(f"Adding column '{col_name}'...")
                    try:
                        conn.execute(text(f"ALTER TABLE channels ADD COLUMN {col_name} {col_type}"))
                        conn.commit()
                        print(f"Successfully added '{col_name}'.")
                        added_count += 1
                    except Exception as e:
                        print(f"Error adding '{col_name}': {e}")
                else:
                    print(f"Column '{col_name}' already exists.")
        
        if added_count > 0:
            print(f"\nMigration finished. Added {added_count} columns.")
        else:
            print("\nNothing to migrate. Database is up to date.")

if __name__ == "__main__":
    migrate()
