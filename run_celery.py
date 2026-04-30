import os
import sys
import subprocess
import time

def run_worker():
    """
    Explicitly run the Celery worker for the IPTV Manager.
    """
    print("\n" + "="*60)
    print(" [SYSTEM] IPTV MANAGER CELERY WORKER ")
    print("="*60)
    
    # Ensure the current directory is in sys.path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
        
    print(f" [INFO] Project Root: {script_dir}")
    
    # Disable scheduler for worker processes
    os.environ['SKIP_SCHEDULER'] = '1'
    
    # Verify we can import the app and its config
    try:
        from run_iptv import celery_worker
        print(f" [INFO] Broker Config: {celery_worker.conf.broker_url}")
    except Exception as e:
        print(f" [CRITICAL] Failed to load application config: {e}")
        return

    # Define command
    cmd = [
        sys.executable, "-m", "celery", 
        "-A", "run_iptv.celery_worker", 
        "worker", 
        "--loglevel=info",
        "--pool=solo" # Use pool=solo explicitly for Windows stability
    ]
    
    print(" [INFO] Starting Celery worker (Pool: solo)...")
    print("="*60 + "\n")
    
    try:
        # Use subprocess.run and pass current environment
        subprocess.run(cmd, cwd=script_dir, env=os.environ.copy())
    except KeyboardInterrupt:
        print("\n [SYSTEM] Celery Worker shutting down...")
    except Exception as e:
        print(f" [ERROR] Unexpected failure: {e}")

if __name__ == "__main__":
    run_worker()
