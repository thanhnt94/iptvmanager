from flask import Flask, render_template, redirect, url_for, request, jsonify, send_from_directory, abort
import os
import shutil
import time
from datetime import datetime
from app.core.config import Config
from app.core.database import db, migrate
from app.modules.health.tasks import init_scheduler
from app.modules.health.models import ScannerStatus
from flask_login import current_user, login_required
import requests
from sqlalchemy import event
from sqlalchemy.engine import Engine

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()
    except Exception:
        # Not all databases support these pragmas (e.g. Postgres)
        pass

def create_app(config_class=Config):
    # Set static_folder to the Vite build output
    static_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'app', 'static', 'dist')
    app = Flask(__name__, static_folder=static_folder, static_url_path='')
    app.config.from_object(config_class)
    
    # Global Routing Optimization: Prevent trailing slash 404s
    app.url_map.strict_slashes = False
    
    # Ensure database directory exists
    db_path = app.config.get('DB_PATH')
    if db_path:
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
    
    # Initialize Logging
    from app.core.logging_config import setup_logging
    setup_logging(app)
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Initialize Server-side Session
    from flask_session import Session
    app.config['SESSION_SQLALCHEMY'] = db
    Session(app)
    
    # --- CORE BLUEPRINT REGISTRATION ---
    from app.modules.ingestion.routes import ingestion_bp
    from app.modules.channels.routes import channels_bp, streams_bp
    from app.modules.playlists.routes import playlists_bp, publish_bp
    from app.modules.auth.routes import auth_bp
    from app.modules.auth_center.routes import auth_center_bp
    from app.modules.health.routes import health_bp
    from app.modules.settings.routes import settings_bp
    from app.modules.channels.epg_routes import epg_bp
    
    # Mount everything under /api for SPA compatibility
    app.register_blueprint(ingestion_bp, url_prefix='/api/ingestion')
    app.register_blueprint(channels_bp, url_prefix='/api/channels')
    app.register_blueprint(streams_bp, url_prefix='/api/streams')
    app.register_blueprint(playlists_bp, url_prefix='/api/playlists')
    app.register_blueprint(publish_bp) # NO PREFIX for friendly URLs
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(auth_center_bp, url_prefix='/api/auth-center')
    app.register_blueprint(health_bp, url_prefix='/api/health')
    app.register_blueprint(settings_bp, url_prefix='/api/settings')
    app.register_blueprint(epg_bp, url_prefix='/api/epg')

    # Initialize Login Manager
    from flask_login import LoginManager
    login_manager = LoginManager()
    login_manager.init_app(app)
    @app.before_request
    def log_request_info():
        if request.path.startswith('/api'):
            app.logger.debug(f"API Request: {request.method} {request.path}")

    @app.after_request
    def log_response_info(response):
        if request.path.startswith('/api'):
            app.logger.debug(f"API Response: {request.path} -> {response.status} ({response.content_type})")
        return response
    
    @login_manager.unauthorized_handler
    def handle_unauthorized():
        # Return JSON for API requests
        if request.path.startswith('/api'):
            return jsonify({
                "status": "error",
                "error": "Unauthorized",
                "message": "Auth required"
            }), 401
        # For non-API requests (SPA routes), index.html will be served by the 404 handler
        return redirect(url_for('index'))
    
    from app.modules.auth.services import AuthService
    @login_manager.user_loader
    def load_user(user_id):
        return AuthService.get_user_by_id(user_id)
    
    # Initialize Scheduler
    init_scheduler(app)
    
    # --- GLOBAL SYSTEM APIs ---

    @app.route('/api/health')
    def api_health():
        return jsonify({"status": "online", "service": "iptv-manager", "timestamp": datetime.now().isoformat()})

    @app.route('/admin')
    def global_admin_portal():
        """Top-level /admin direct access."""
        if current_user.role != 'admin':
            return abort(403)
        # Serve the SPA index at this path to let React handle it correctly
        if os.path.exists(os.path.join(app.static_folder, 'index.html')):
            return send_from_directory(app.static_folder, 'index.html')
        return redirect('/settings')

    @app.route('/logout')
    def global_logout():
        """Perform logout and return home."""
        from flask_login import logout_user
        logout_user()
        return redirect('/')

    @app.route('/api/player/playlists')
    @app.route('/api/player/channels/<int:playlist_id>')
    @login_required
    def api_player_compat(playlist_id=None):
        # Alias for backward compatibility with various frontend versions
        if 'channels' in request.path:
             return redirect(url_for('playlists.get_entries', playlist_id=playlist_id or 0))
        return redirect(url_for('playlists.list_playlists'))

    @app.route('/api/dashboard/stats')
    @login_required
    def api_dashboard_stats():
        from app.modules.channels.models import Channel
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.auth.models import User
        from app.modules.channels.services import ActiveSessionManager
        from app.modules.health.services import HealthCheckService
        
        return jsonify({
            'channels': {
                'total': Channel.query.count(),
                'live': Channel.query.filter_by(status='live').count(),
                'die': Channel.query.filter_by(status='die').count(),
                'unknown': Channel.query.filter((Channel.status == None) | (Channel.status == 'unknown')).count()
            },
            'playlists': {'total': PlaylistProfile.query.count()},
            'users': {'total': User.query.count()},
            'active_streams': len(ActiveSessionManager.get_active_sessions()),
            'server': ActiveSessionManager.get_server_stats(),
            'scan': HealthCheckService.get_status()
        })

    # --- SPA ROUTING & ERROR HANDLING ---

    @app.route('/')
    def index():
        if os.path.exists(os.path.join(app.static_folder, 'index.html')):
            return send_from_directory(app.static_folder, 'index.html')
        return "Frontend build not found. Run 'npm run build' in iptv-studio.", 404

    @app.errorhandler(404)
    def handle_404(e):
        # 1. API 404 Prevention: Return JSON instead of HTML for any matched /api/* path
        # This only triggers if the request didn't match any blueprint route above.
        path = request.path.lstrip('/')
        if path.startswith('api') or request.path.startswith('/api'):
            return jsonify({
                'error': 'API Endpoint not found', 
                'path': request.path,
                'suggestion': 'Check blueprint registration or trailing slashes'
            }), 404
            
        # 2. Skip SPA for Playback/Redirect roots (Handled by blueprints)
        if request.path.startswith(('/play/', '/track/', '/health/')):
             return jsonify({'error': 'Resource handle mismatch'}), 404

        # 3. Default: Serve index.html to allow React Router to handle the path
        return send_from_directory(app.static_folder, 'index.html')

    @app.errorhandler(Exception)
    def handle_exception(e):
        # Pass through HTTP errors
        if hasattr(e, 'code') and e.code:
             if request.path.startswith('/api'):
                 return jsonify({"error": str(e)}), e.code
             return e
        
        # Log the actual traceback
        app.logger.error(f"Unhandled Exception: {str(e)}", exc_info=True)
        
        # Return JSON for API
        if request.path.startswith('/api'):
            return jsonify({
                "error": "Internal Server Error",
                "message": str(e)
            }), 500
        return "Internal Server Error", 500


    # --- DATABASE INITIALIZATION & SEEDING ---
    with app.app_context():
        try:
            # 1. Ensure all tables are created
            app.logger.info("Verifying database schema...")
            db.create_all()
            
            # 2. Seed Admin User
            from app.modules.auth.models import User
            admin = User.query.filter_by(username='admin').first()
            if not admin:
                app.logger.info("Seeding default admin user...")
                admin = User(
                    username='admin', 
                    email='admin@iptv.local', 
                    role='admin',
                    full_name='System Administrator'
                )
                admin.set_password('admin')
                db.session.add(admin)
                db.session.commit()
                app.logger.info("Admin user created successfully.")
            
            # 3. Seed System Playlists
            from app.modules.playlists.services import PlaylistService
            app.logger.info("Verifying system playlists...")
            # Ensure global system playlists exist
            PlaylistService.ensure_global_system_playlists()
            
            # Ensure all existing users have their default personalized playlists
            from app.modules.auth.models import User
            for user in User.query.all():
                PlaylistService.ensure_user_default_playlists(user)

            # 4. Auto-detect FFmpeg/FFprobe
            from app.modules.settings.services import SettingService

            for tool in ['FFMPEG', 'FFPROBE']:
                key = f'{tool}_PATH'
                bin_name = tool.lower()
                # If current setting is default (basename) or empty, try to find absolute path
                current = SettingService.get(key)
                if not current or current == bin_name:
                    found_path = shutil.which(bin_name)
                    if not found_path:
                        # Common Linux paths fallback
                        for p in [f'/usr/bin/{bin_name}', f'/usr/local/bin/{bin_name}', f'/snap/bin/{bin_name}']:
                            if os.path.exists(p):
                                found_path = p
                                break
                    if found_path:
                        app.logger.info(f"Auto-detected {tool} at: {found_path}")
                        SettingService.set(key, found_path, description=f"Auto-detected {tool} path")

            db.session.commit()
            app.logger.info("Database initialization complete.")
        except Exception as e:
            app.logger.error(f"Database initialization failed: {str(e)}")
            # Do not raise here to allow app to start even if DB is partially broken, 
            # though usually this is critical.

    return app
