from flask import Flask, render_template, redirect, url_for, request, jsonify
from app.core.config import Config
from app.core.database import db, migrate
from app.modules.health.tasks import init_scheduler

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Register blueprints
    from app.modules.ingestion.routes import ingestion_bp
    from app.modules.channels.routes import channels_bp
    from app.modules.playlists.routes import playlists_bp
    app.register_blueprint(ingestion_bp, url_prefix='/ingestion')
    app.register_blueprint(channels_bp, url_prefix='/channels')
    app.register_blueprint(playlists_bp, url_prefix='/playlists')
    
    # Initialize Scheduler
    init_scheduler(app)
    
    # Routes
    @app.route('/')
    def index():
        return redirect(url_for('channels.index'))

    @app.route('/health/check-now', methods=['POST'])
    def check_now():
        from app.modules.health.services import HealthCheckService
        data = request.json or {}
        mode = data.get('mode', 'all')
        days = data.get('days')
        HealthCheckService.start_background_scan(app, mode=mode, days=days)
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
        db.create_all()
        
    return app
