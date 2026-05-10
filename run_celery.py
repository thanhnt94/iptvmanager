"""
run_celery.py — Entry point to start the Celery worker.
Usage: python run_celery.py
"""
import os
import subprocess
import sys

def run_worker():
    print("Starting IPTV Celery Worker...")
    # Using subprocess to run celery command
    # Equivalent to: celery -A app.core.celery_app worker --loglevel=info -P eventlet
    cmd = [
        "celery",
        "-A", "app.core.celery_app",
        "worker",
        "--loglevel=info",
        "-P", "eventlet" if os.name == 'nt' else 'solo'
    ]
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\nWorker stopped.")

if __name__ == "__main__":
    run_worker()
