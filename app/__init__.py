from flask import Flask, render_template, redirect, url_for, request, jsonify
from app.core.config import Config
from app.core.database import db, migrate
from app.modules.health.tasks import init_scheduler

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
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
    
    # --- ECOSYSTEM HEALTH CHECK ---
    @app.route('/api/health')
    def api_health():
        """Public endpoint for CentralAuth health checks."""
        return jsonify({"status": "online", "service": "iptv-manager"})

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
        import os
        # Import all models here to ensure they are registered with SQLAlchemy
        from app.modules.auth.models import User
        from app.modules.channels.models import Channel
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.settings.models import SystemSetting
        
        db_path = app.config['DB_PATH']
        db_dir = os.path.dirname(db_path)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir)
            
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
            {"key": "CENTRAL_AUTH_API_URL", "value": "http://127.0.0.1:5001", "description": "Lần lượt là URL API của CentralAuth Server."},
            {"key": "CENTRAL_SSO_WEB_URL", "value": "http://127.0.0.1:5001", "description": "URL trang web đăng nhập của CentralAuth."},
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
