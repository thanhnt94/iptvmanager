import subprocess
import os
import sys
import shutil

def build_frontend():
    """
    Builds the 'iptv-studio' frontend for production.
    This generates the static files in 'app/static/dist' for Flask to serve.
    """
    print(" [BUILD] Starting Frontend Build Process...")
    
    # Path to the frontend directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, 'iptv-studio')
    
    if not os.path.exists(frontend_dir):
        print(f" [ERROR] Frontend directory not found at: {frontend_dir}")
        return

    is_windows = os.name == 'nt'

    # 1. Install dependencies if node_modules doesn't exist
    if not os.path.exists(os.path.join(frontend_dir, 'node_modules')):
        print(" [BUILD] node_modules not found. Running 'npm install'...")
        try:
            subprocess.run(["npm", "install"], cwd=frontend_dir, shell=is_windows, check=True)
        except Exception as e:
            print(f" [ERROR] npm install failed: {e}")
            return

    # 2. Run build command
    print(" [BUILD] Executing 'npm run build'...")
    try:
        subprocess.run(["npm", "run", "build"], cwd=frontend_dir, shell=is_windows, check=True)
        print(" [BUILD] Success! Static files generated in 'app/static/dist'.")
    except Exception as e:
        print(f" [ERROR] npm build failed: {e}")
        return

if __name__ == "__main__":
    build_frontend()
