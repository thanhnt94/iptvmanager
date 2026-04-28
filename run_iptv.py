import subprocess
import time
import sys
import os
from app import create_app

app = create_app()
celery_worker = app.celery_app # Export for celery CLI

def start_celery_worker():
    """Starts the Celery worker as a background process."""
    print(" [SYSTEM] Starting Celery Worker...")
    
    # Get the absolute path of the directory containing this file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # On Windows, we must use '-P solo' or '-P eventlet'
    cmd = [
        sys.executable, "-m", "celery", 
        "-A", "run_iptv.celery_worker", 
        "worker", 
        "--loglevel=info", 
        "-P", "solo"
    ]
    
    # Set CWD to the script directory so Celery can find 'run_iptv' and 'app'
    return subprocess.Popen(cmd, cwd=script_dir)

if __name__ == "__main__":
    worker_proc = None
    try:
        # 1. Start Celery Worker
        worker_proc = start_celery_worker()
        
        # 2. Give it a second to initialize
        time.sleep(2)
        
        # 3. Start Flask App
        print(f" [SYSTEM] Starting IPTV Manager on http://localhost:5030")
        app.run(debug=True, port=5030, use_reloader=False) # use_reloader=False prevents double worker start
    except KeyboardInterrupt:
        print("\n [SYSTEM] Shutting down...")
    finally:
        if worker_proc:
            worker_proc.terminate()
            print(" [SYSTEM] Celery Worker stopped.")
