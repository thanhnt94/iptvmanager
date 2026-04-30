from app import create_app
from app.core.database import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    try:
        # Check index names
        result = db.session.execute(text("PRAGMA index_list('channels')"))
        indexes = result.fetchall()
        print("Indexes on channels table:")
        for idx in indexes:
            print(f" - {idx[1]} (Unique: {idx[2]})")
            if idx[2] == 1: # Unique
                # Try to drop it. Note: SQLite doesn't allow dropping automatic unique constraint indexes directly 
                # unless they were created as named indexes. 
                # If it's a PRIMARY KEY or a UNIQUE constraint on column definition, we might need a table rebuild.
                pass
        
        # SQLite constraint removal is tricky. 
        # A simpler way for the user: Just handle it in code by checking existence.
        # But user said they don't want to compare.
        
    except Exception as e:
        print(f"Error: {e}")
