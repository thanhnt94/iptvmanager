from flask import Flask, render_template, redirect, url_for, request, jsonify, send_from_directory, abort, Response
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
    # Set static_folder to the Vite build output (Absolute Path)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    static_folder = os.path.join(base_dir, 'app', 'static', 'dist')
    
    app = Flask(__name__, static_folder=static_folder, static_url_path='')
    
    print(f" [SYSTEM] Static folder set to: {static_folder}")
    if not os.path.exists(static_folder):
        print(f" [WARNING] Static folder NOT FOUND at: {static_folder}")
    app.config.from_object(config_class)
    
    # Global Routing Optimization: Prevent trailing slash 404s
    app.url_map.strict_slashes = False

    # --- PRIORITY PLAYLIST ROUTES (M3U TEXT) ---
    @app.route('/<username>/<slug>', defaults={'arg1': None, 'arg2': None})
    @app.route('/p/<username>/<slug>', defaults={'arg1': None, 'arg2': None})
    @app.route('/<username>/<slug>.m3u8', defaults={'arg1': None, 'arg2': None})
    @app.route('/p/<username>/<slug>.m3u8', defaults={'arg1': None, 'arg2': None})
    @app.route('/<username>/<slug>/<arg1>', defaults={'arg2': None})
    @app.route('/p/<username>/<slug>/<arg1>', defaults={'arg2': None})
    @app.route('/<username>/<slug>/<arg1>/<arg2>')
    @app.route('/p/<username>/<slug>/<arg1>/<arg2>')
    def global_ultra_simple_playlist(username, slug, arg1, arg2):
        """The ULTIMATE simple route: Intelligent segment parsing."""
        # Strip .m3u8
        clean_slug = slug.replace('.m3u8', '')
        
        # GUARD: Prevent hijacking system paths
        if username in ['assets', 'static', 'api', 'favicon.ico', 'logout', 'play', 'track', 'auth', 'auth-center', 'settings', 'ingestion', 'health']:
            return handle_404(None)
            
        from app.modules.auth.models import User
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.playlists.services import PlaylistService
        
        user = User.query.filter_by(username=username).first()
        if not user:
            app.logger.debug(f" [M3U] No user found for: {username}")
            return handle_404(None)
        
        actual_slug = clean_slug
        if clean_slug.lower() == 'all':
            actual_slug = f"user-{user.id}-all"
        elif clean_slug.lower() == 'protected':
            actual_slug = f"user-{user.id}-protected"
            
        profile = PlaylistProfile.query.filter_by(slug=actual_slug, owner_id=user.id).first()
        if not profile:
            app.logger.debug(f" [M3U] No profile found for slug: {actual_slug}")
            return handle_404(None)
        
        # Mode & Status Parsing
        mode = 'smart'
        hide_die = False
        for arg in [arg1, arg2]:
            if not arg: continue
            arg_low = arg.lower()
            if arg_low in ['tracking', 'track']: mode = 'tracking'
            elif arg_low == 'direct': mode = 'direct'
            elif arg_low == 'smart': mode = 'smart'
            elif arg_low == 'live': hide_die = True
            elif arg_low == 'all': hide_die = False

        # Auto-generate EPG URL
        xml_url = url_for('global_ultra_simple_playlist', username=username, slug=f"{clean_slug}.xml", _external=True)
        if slug.endswith('.xml'):
            return Response(PlaylistService.generate_xmltv(profile.id), mimetype='text/xml')

        app.logger.info(f" [PRIORITY-HIT] Serving M3U: {username}/{slug} | Mode: {mode} | Live: {hide_die}")
        m3u_content = PlaylistService.generate_m3u(profile.id, epg_url=xml_url, hide_die=hide_die, mode=mode)
        return Response(m3u_content, mimetype='text/plain')

    @app.route('/logout')
    def global_logout():
        """Perform logout and return home."""
        from flask_login import logout_user
        logout_user()
        return redirect('/')
    
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
    
    # Initialize Celery
    from app.core.celery_app import celery_init_app
    app.celery_app = celery_init_app(app)
    
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
    # Noisy API logging removed to focus on health checks and ingestion
    
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
    
    # Initialize Scheduler (unless skipped via env)
    if os.environ.get('SKIP_SCHEDULER') != '1':
        init_scheduler(app)
    else:
        app.logger.info(" [SYSTEM] Skipping APScheduler initialization for this process.")
    
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
                'live': Channel.query.filter_by(status='live', is_passthrough=False).count(),
                'die': Channel.query.filter_by(status='die', is_passthrough=False).count(),
                'unknown': Channel.query.filter(((Channel.status == None) | (Channel.status == 'unknown')) & (Channel.is_passthrough == False)).count(),
                'passthrough': Channel.query.filter_by(is_passthrough=True).count()
            },
            'playlists': {'total': PlaylistProfile.query.count()},
            'users': {'total': User.query.count()},
            'active_streams': len(ActiveSessionManager.get_active_sessions()),
            'server': ActiveSessionManager.get_server_stats(),
            'scan': HealthCheckService.get_status()
        })

    # --- SPA ROUTING & ERROR HANDLING ---

    @app.route('/assets/<path:filename>')
    def serve_assets(filename):
        return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)

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
        if path.startswith(('api', 'assets', 'static')) or request.path.startswith('/api'):
            return jsonify({
                'error': 'API Endpoint not found', 
                'path': request.path,
                'suggestion': 'Check blueprint registration or trailing slashes'
            }), 404
            
        # 2. Skip SPA for Playback/Redirect roots (Handled by blueprints)
        if request.path.startswith(('/play/', '/track/', '/health/')):
             return jsonify({'error': 'Resource handle mismatch'}), 404

        # 3. GUARD: If it looks like a 2-segment playlist path that failed, don't serve SPA
        # This prevents the redirect loop for /admin/all
        parts = path.split('/')
        if len(parts) >= 2 and not path.startswith('settings'):
             return f"404 Not Found: The resource '{path}' does not exist on this server.", 404

        # 4. Default: Serve index.html to allow React Router to handle the path
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

            # 5. Clean up stale scanner state on startup
            from app.modules.health.models import ScannerStatus
            scanner_state = ScannerStatus.get_singleton()
            if scanner_state.is_running or scanner_state.stop_requested:
                app.logger.info(" [SYSTEM] Cleaning up stale scanner state on startup...")
                scanner_state.is_running = False
                scanner_state.stop_requested = False
                db.session.commit()

            app.logger.info("Database initialization complete.")
        except Exception as e:
            app.logger.error(f"Database initialization failed: {str(e)}")
            # Do not raise here to allow app to start even if DB is partially broken, 
            # though usually this is critical.

    return app
