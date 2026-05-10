"""
run_iptv.py — Main Launcher for the IPTV Ecosystem.
Runs the FastAPI application using Uvicorn.
"""
import uvicorn
import os
import sys

# Ensure the current directory is in PYTHONPATH
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    # You can customize host/port here or via environment variables
    PORT = int(os.environ.get("IPTV_PORT", 5030))
    HOST = os.environ.get("IPTV_HOST", "0.0.0.0")
    
    print("=" * 60)
    print(f"  IPTV Manager v2.0 (FastAPI) — Starting on http://{HOST}:{PORT}")
    print("=" * 60)
    
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=True,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*"
    )
