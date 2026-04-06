from flask import Flask, render_template, redirect, url_for, request, jsonify
import os
from app.core.config import Config
from app.core.database import db, migrate
from app.modules.health.tasks import init_scheduler

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Ensure database directory exists before any extensions initialize
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
    
    # Register blueprints
    from app.modules.ingestion.routes import ingestion_bp
    from app.modules.channels.routes import channels_bp
    from app.modules.playlists.routes import playlists_bp
    from app.modules.auth.routes import auth_bp
    from app.modules.settings.routes import settings_bp
    from app.modules.auth_center.routes import auth_center_bp
    app.register_blueprint(ingestion_bp, url_prefix='/ingestion')
    app.register_blueprint(channels_bp, url_prefix='/channels')
    app.register_blueprint(playlists_bp, url_prefix='/playlists')
    app.register_blueprint(auth_bp, url_prefix='/auth')
    
    # SECURE ADMIN PORTAL: Unified /admin route for fallback and configuration
    @app.route('/admin', methods=['GET', 'POST'])
    def admin_portal():
        from flask_login import current_user, login_user
        from app.modules.auth.services import AuthService
        from app.modules.settings.services import SettingService
        from app.modules.playlists.models import PlaylistProfile
        from flask import session, render_template, request, flash, redirect, url_for

        if request.method == 'GET':
            if current_user.is_authenticated and current_user.role == 'admin':
                # Already logged in as admin, show settings
                playlists = PlaylistProfile.query.all()
                return render_template('settings/admin.html', settings=SettingService.get_all(), playlists=playlists)
            
            # Not authenticated or not admin, show local login form
            # Passing emergency=True to show the local login warning (like PodLearn/MindStack)
            return render_template('auth/login.html', emergency=True)

        if request.method == 'POST':
            username = request.form.get('username')
            password = request.form.get('password')
            remember = True if request.form.get('remember') else False
            
            user = AuthService.get_user_by_username(username)
            
            if user and user.check_password(password) and user.role == 'admin':
                login_user(user, remember=remember)
                return redirect(url_for('admin_portal'))
            
            flash('Invalid local credentials or you are not an administrator.', 'danger')
            return redirect(url_for('admin_portal'))
        
    app.register_blueprint(settings_bp, url_prefix='/settings')
    app.register_blueprint(auth_center_bp, url_prefix='/auth-center')
    
    # Initialize Login Manager
    from flask_login import LoginManager
    login_manager = LoginManager()
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'info'
    login_manager.init_app(app)
    
    from app.modules.auth.services import AuthService
    @login_manager.user_loader
    def load_user(user_id):
        return AuthService.get_user_by_id(user_id)
    
    # Initialize Scheduler
    init_scheduler(app)
    
    @app.route('/api/health')
    def api_health():
        """Public endpoint for CentralAuth health checks."""
        return jsonify({"status": "online", "service": "iptv-manager"})

    # --- ECOSYSTEM SYNC API ---
    @app.route('/api/sso-internal/user-list', methods=['POST'])
    def internal_user_list():
        """
        Standard Internal API for CentralAuth User Synchronization.
        Protected by Client Secret verification from SystemSettings.
        """
        from app.modules.settings.models import SystemSetting
        from app.modules.auth.models import User
        
        secret_header = request.headers.get('X-Client-Secret')
        setting = SystemSetting.query.filter_by(key='CENTRAL_AUTH_CLIENT_SECRET').first()
        configured_secret = setting.value if setting else None

        if not secret_header or secret_header != configured_secret:
            return jsonify({"error": "Unauthorized"}), 401

        users = User.query.all()
        user_list = []
        for user in users:
            user_list.append({
                "username": user.username,
                "email": user.email,
                "full_name": user.username, # IPTV doesn't have a dedicated full_name field in model
                "central_auth_id": user.central_auth_id
            })
            
        return jsonify({"users": user_list}), 200

    @app.route('/api/sso-internal/link-user', methods=['POST'])
    def internal_link_user():
        """Update a user's central_auth_id for ecosystem linking. Supports Admin Push-Back."""
        from app.modules.settings.models import SystemSetting
        from app.modules.auth.models import User
        
        secret_header = request.headers.get('X-Client-Secret')
        setting = SystemSetting.query.filter_by(key='CENTRAL_AUTH_CLIENT_SECRET').first()
        configured_secret = setting.value if setting else None

        if not secret_header or secret_header != configured_secret:
            return jsonify({"error": "Unauthorized"}), 401

        data = request.get_json()
        email = data.get('email')
        ca_id = data.get('central_auth_id')
        username = data.get('username')
        full_name = data.get('full_name')
        is_admin_sync = data.get('is_admin_sync', False)

        if not ca_id:
            return jsonify({"error": "Missing central_auth_id"}), 400

        target_user = None

        # 1. Admin Push-back logic
        if is_admin_sync:
            # Target local ID 1
            target_user = User.query.get(1)
            if target_user:
                # Check if already linked to someone else
                if target_user.central_auth_id and target_user.central_auth_id != ca_id:
                    return jsonify({"error": "Local ID 1 is already linked to a different CentralAuth account"}), 409
                
                # Perform Push-back (Overwrite local admin identity)
                target_user.username = username or target_user.username
                target_user.email = email or target_user.email
                if hasattr(target_user, 'full_name'):
                    target_user.full_name = full_name or target_user.full_name
                target_user.central_auth_id = ca_id
                db.session.commit()
                return jsonify({"status": "success", "message": f"Admin identity pushed back to local ID 1 ({target_user.username})"}), 200

        # 2. Standard linking logic
        if not target_user:
            target_user = User.query.filter_by(email=email).first()
        
        if not target_user and not is_admin_sync:
            # Try finding by username as fallback
            target_user = User.query.filter_by(username=username).first()

        if target_user:
            target_user.central_auth_id = ca_id
            if full_name and hasattr(target_user, 'full_name'):
                target_user.full_name = full_name
            db.session.commit()
            return jsonify({"status": "success", "message": f"User {target_user.username} linked to CentralAuth ID {ca_id}"}), 200
        
        return jsonify({"error": "User not found for linking"}), 404

        data = request.get_json()
        email = data.get('email')
        ca_id = data.get('central_auth_id')
        username = data.get('username')
        
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": f"User {email} not found"}), 404
        
        user.central_auth_id = str(ca_id)
        if username:
            user.username = username
            
        db.session.commit()
        return jsonify({"status": "ok", "message": f"Linked {email} and synced profile to CentralAuth."}), 200

    @app.route('/api/sso-internal/delete-user', methods=['POST'])
    def internal_delete_user():
        """Delete a user from this app's database."""
        from app.modules.settings.models import SystemSetting
        from app.modules.auth.models import User
        
        secret_header = request.headers.get('X-Client-Secret')
        setting = SystemSetting.query.filter_by(key='CENTRAL_AUTH_CLIENT_SECRET').first()
        configured_secret = setting.value if setting else None

        if not secret_header or secret_header != configured_secret:
            return jsonify({"error": "Unauthorized"}), 401

        data = request.get_json()
        email = data.get('email')
        
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": f"User {email} not found"}), 404
        
        db.session.delete(user)
        db.session.commit()
        return jsonify({"status": "ok", "message": f"Deleted {email}"}), 200

    @app.route('/')
    def index():
        return redirect(url_for('channels.index'))

    @app.route('/health/check-now', methods=['POST'])
    def check_now():
        from app.modules.health.services import HealthCheckService
        data = request.json or {}
        mode = data.get('mode', 'all')
        days = data.get('days')
        playlist_id = data.get('playlist_id')
        HealthCheckService.start_background_scan(app, mode=mode, days=days, playlist_id=playlist_id)
        return jsonify({"status": "started"})
        
    @app.route('/health/status', methods=['GET'], endpoint='health_status')
    def health_status():
        from app.modules.health.services import HealthCheckService
        return jsonify(HealthCheckService.get_status())
        
    @app.route('/health/stop', methods=['POST'], endpoint='stop_health_check')
    def stop_health_check():
        from app.modules.health.services import HealthCheckService
        HealthCheckService.stop_scan()
        return jsonify({"status": "stop_requested"})
    
    # Create tables automatically for development
    with app.app_context():
        # Import all models here to ensure they are registered with SQLAlchemy
        from app.modules.auth.models import User
        from app.modules.channels.models import Channel
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.settings.models import SystemSetting
        
        db.create_all()
        
        # Seed Admin User
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(username='admin', role='admin')
            admin.set_password('admin')
            db.session.add(admin)
            db.session.commit()
            print("Seeded admin/admin account.")

        # Seed System Settings for SSO
        from app.modules.settings.models import SystemSetting
        default_settings = [
            {"key": "CENTRAL_AUTH_API_URL", "value": "http://127.0.0.1:5000", "description": "URL API của CentralAuth Server (Cổng 5000)."},
            {"key": "CENTRAL_SSO_WEB_URL", "value": "http://127.0.0.1:5000", "description": "URL trang web đăng nhập của CentralAuth (Cổng 5000)."},
            {"key": "CENTRAL_AUTH_CLIENT_ID", "value": "iptv-manager", "description": "Client ID đăng ký tại CentralAuth."},
            {"key": "CENTRAL_AUTH_CLIENT_SECRET", "value": "iptv-secret-key-789", "description": "Client Secret đăng ký tại CentralAuth."},
            {"key": "USE_CENTRAL_AUTH", "value": "false", "description": "Bật/Tắt đăng nhập tập trung SSO."}
        ]
        settings_created = False
        for ds in default_settings:
            if not SystemSetting.query.filter_by(key=ds['key']).first():
                new_setting = SystemSetting(**ds)
                db.session.add(new_setting)
                settings_created = True
        if settings_created:
            db.session.commit()
            print("Seeded default SSO settings.")

        from app.modules.playlists.services import PlaylistService
        PlaylistService.ensure_system_playlist()
        
    return app
