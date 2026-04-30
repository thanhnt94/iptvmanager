import subprocess
import os
import sys

def run_vite_dev():
    """
    Runs the Vite development server for the 'iptv-studio' frontend.
    This allows for hot-reloading during development.
    """
    print(" [FRONTEND] Starting Vite Development Server...")
    
    # Path to the frontend directory
    frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'iptv-studio')
    
    if not os.path.exists(frontend_dir):
        print(f" [ERROR] Frontend directory not found at: {frontend_dir}")
        return

    # Command to run vite (assuming npm is installed)
    # Using 'npm run dev' which is the standard Vite dev command
    cmd = ["npm", "run", "dev"]
    
    # On Windows, we might need shell=True for npm
    is_windows = os.name == 'nt'
    
    try:
        print(f" [FRONTEND] Executing 'npm run dev' in {frontend_dir}")
        subprocess.run(cmd, cwd=frontend_dir, shell=is_windows)
    except KeyboardInterrupt:
        print("\n [FRONTEND] Vite Server stopped.")
    except Exception as e:
        print(f" [ERROR] Failed to start Vite: {e}")

if __name__ == "__main__":
    run_vite_dev()
