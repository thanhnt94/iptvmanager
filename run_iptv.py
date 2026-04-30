import sys
import os
from app import create_app

# Create the Flask application
app = create_app()

# Export celery_worker for the Celery CLI to find (important for run_celery.py)
celery_worker = app.celery_app

if __name__ == "__main__":
    """
    Start the IPTV Manager Web Server.
    """
    print("\n" + "="*60)
    print(" [SYSTEM] IPTV MANAGER WEB SERVER ")
    print("="*60)
    print(f" [INFO] Running on http://localhost:5030")
    print(" [IMPORTANT] For scanning and background tasks to work, you MUST")
    print("             open another terminal and run: python run_celery.py")
    print("="*60 + "\n")
    
    try:
        # Debug=True is safe here as it won't restart background workers anymore
        app.run(debug=True, use_reloader=False, port=5030, host='0.0.0.0')
    except KeyboardInterrupt:
        print("\n [SYSTEM] Shutting down Web Server...")
