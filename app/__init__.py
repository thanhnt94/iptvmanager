from flask import Flask, render_template, redirect, url_for, request, jsonify, send_from_directory
import os
import time
from datetime import datetime
from app.core.config import Config
from app.core.database import db, migrate
from app.modules.health.tasks import init_scheduler
from flask_login import current_user, login_required
import requests

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
        from flask_login import login_user
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

    # --- VITE SPA CATCH-ALL ROUTE ---
    
    @app.route('/studio', defaults={'path': ''})
    @app.route('/studio/<path:path>')
    def serve_studio(path):
        dist_dir = os.path.join(app.root_path, 'static', 'dist')
        if path != "" and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
        else:
            return send_from_directory(dist_dir, 'index.html')

    @app.route('/api/auth/config')
    def api_auth_config():
        from app.modules.settings.models import SystemSetting
        use_sso = SystemSetting.query.filter_by(key='USE_CENTRAL_AUTH').first()
        use_sso_val = use_sso.value.lower() == 'true' if use_sso else False
        
        # Check if actually reachable (Fail-safe)
        sso_reachable = False
        if use_sso_val:
            api_url = SystemSetting.query.filter_by(key='CENTRAL_AUTH_API_URL').first()
            if api_url:
                try:
                    requests.get(f"{api_url.value.rstrip('/')}/api/health", timeout=0.8)
                    sso_reachable = True
                except:
                    sso_reachable = False

        return jsonify({
            'use_sso': use_sso_val,
            'sso_reachable': sso_reachable,
            'emergency_mode': request.args.get('emergency') == 'true'
        })

    @app.route('/api/auth/login', methods=['POST'])
    def api_auth_login():
        from app.modules.auth.services import AuthService
        from flask_login import login_user
        
        data = request.json or {}
        username = data.get('username')
        password = data.get('password')
        remember = data.get('remember', False)
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
            
        user = AuthService.get_user_by_username(username)
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid credentials'}), 401
            
        login_user(user, remember=remember)
        return jsonify({
            'status': 'success',
            'user': {
                'username': user.username,
                'role': user.role
            }
        })

    @app.route('/api/dashboard/stats')
    def api_dashboard_stats():
        from app.modules.channels.models import Channel
        from app.modules.playlists.models import PlaylistProfile
        from app.modules.channels.services import ActiveSessionManager
        from app.modules.health.services import HealthCheckService
        
        stats = {
            'channels': {
                'total': Channel.query.count(),
                'live': Channel.query.filter_by(status='live').count(),
                'die': Channel.query.filter_by(status='die').count(),
                'unknown': Channel.query.filter((Channel.status == None) | (Channel.status == 'unknown')).count()
            },
            'playlists': {
                'total': PlaylistProfile.query.count()
            },
            'active_streams': len(ActiveSessionManager.get_active_sessions()),
            'server': ActiveSessionManager.get_server_stats(),
            'scan': HealthCheckService.get_status()
        }
        return jsonify(stats)

    @app.route('/api/playlists')
    def api_playlists():
        from app.modules.playlists.models import PlaylistProfile, PlaylistEntry
        profiles = PlaylistProfile.query.all()
        
        data = []
        for p in profiles:
            if p.is_system:
                from app.modules.channels.models import Channel
                channel_count = Channel.query.count()
            else:
                channel_count = PlaylistEntry.query.filter_by(playlist_id=p.id).count()
            
            data.append({
                'id': p.id if not p.is_system else 'system_all',
                'name': p.name,
                'slug': p.slug,
                'is_system': p.is_system,
                'channel_count': channel_count,
                'security_token': p.security_token,
                'created_at': p.created_at.strftime('%Y-%m-%d %H:%M') if p.created_at else 'N/A'
            })
        return jsonify(data)

    @app.route('/api/channels')
    @login_required
    def api_channels_list():
        from app.modules.channels.services import ChannelService
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        search = request.args.get('search', '')
        group = request.args.get('group', '')
        stream_type = request.args.get('stream_type', '')
        status = request.args.get('status', '')
        sort = request.args.get('sort', '')
        is_original = request.args.get('is_original', '')
        stream_format = request.args.get('format', '')
        
        pagination = ChannelService.get_all_channels(
            page=page, 
            per_page=per_page,
            search=search, 
            group_filter=group,
            stream_type_filter=stream_type,
            status_filter=status,
            sort=sort,
            is_original_filter=is_original,
            format_filter=stream_format,
            user=current_user
        )
        
        channels_data = []
        for ch in pagination.items:
            channels_data.append({
                'id': ch.id,
                'name': ch.name,
                'logo_url': ch.logo_url,
                'group_name': ch.group_name,
                'stream_url': ch.stream_url,
                'status': ch.status,
                'stream_format': ch.stream_format,
                'stream_type': ch.stream_type,
                'quality': ch.quality,
                'resolution': ch.resolution,
                'latency': ch.latency,
                'is_original': ch.is_original,
                'last_checked': ch.last_checked_at.strftime('%Y-%m-%d %H:%M') if ch.last_checked_at else 'Never',
                'play_links': {
                    'smart': url_for('channels.play_channel', channel_id=ch.id, token=current_user.api_token, _external=True),
                    'direct': ch.stream_url,
                    'tracking': url_for('channels.track_redirect', channel_id=ch.id, token=current_user.api_token, _external=True),
                    'hls': url_for('channels.play_hls', channel_id=ch.id, token=current_user.api_token, _external=True),
                    'ts': url_for('channels.play_ts', channel_id=ch.id, token=current_user.api_token, _external=True)
                }
            })
            
        return jsonify({
            'channels': channels_data,
            'pagination': {
                'total': pagination.total,
                'pages': pagination.pages,
                'current_page': pagination.page,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            }
        })

    @app.route('/api/channels/filters')
    def api_channels_filters():
        from app.modules.channels.services import ChannelService
        return jsonify({
            'groups': ChannelService.get_distinct_groups(),
            'resolutions': ChannelService.get_distinct_resolutions(),
            'formats': ChannelService.get_distinct_formats(),
            'audio_codecs': ChannelService.get_distinct_audio_codecs()
        })

    @app.route('/api/ingestion/parse-m3u8', methods=['POST'])
    @login_required
    def api_ingestion_parse():
        from app.modules.ingestion.services import IngestionService
        data = request.json or {}
        source = data.get('source')
        is_url = data.get('is_url', False)
        
        if not source:
            return jsonify({'error': 'No source provided'}), 400
            
        channels = IngestionService.parse_m3u8(source, is_url=is_url)
        return jsonify({'channels': channels})

    @app.route('/api/ingestion/commit', methods=['POST'])
    @login_required
    def api_ingestion_commit():
        from app.modules.ingestion.services import IngestionService
        data = request.json or {}
        channels = data.get('channels', [])
        visibility = data.get('visibility', 'private')
        
        if not channels:
            return jsonify({'error': 'No channels to import'}), 400
            
        result = IngestionService.import_channels(channels, visibility=visibility)
        return jsonify(result)

    @app.route('/api/ingestion/excel', methods=['POST'])
    @login_required
    def api_ingestion_excel():
        from app.modules.ingestion.data_services import DataImportService
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        visibility = request.form.get('visibility', 'private')
        result = DataImportService.import_from_excel(file, visibility=visibility)
        return jsonify(result)

    @app.route('/api/channels/<int:channel_id>', methods=['DELETE'])
    def api_channels_delete(channel_id):
        from app.modules.channels.models import Channel
        
        channel = Channel.query.get_or_404(channel_id)
        if current_user.role != 'admin' and channel.owner_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
            
        db.session.delete(channel)
        db.session.commit()
        return jsonify({'status': 'deleted'})

    @app.route('/api/channels/clean-dead', methods=['POST'])
    def api_channels_clean_dead():
        from app.modules.channels.models import Channel
        if current_user.role != 'admin':
            return jsonify({'error': 'Unauthorized'}), 403
            
        query = Channel.query.filter(
            Channel.status == 'die',
            db.or_(Channel.is_original == False, Channel.is_original == None)
        )
        count = query.count()
        query.delete(synchronize_session=False)
        db.session.commit()
        return jsonify({'status': 'success', 'deleted_count': count})

    @app.route('/api/channels/toggle-protection/<int:channel_id>', methods=['POST'])
    def api_channels_toggle_protection(channel_id):
        from app.modules.channels.models import Channel
        if current_user.role != 'admin': return jsonify({'error': 'Unauthorized'}), 403
        
        channel = Channel.query.get_or_404(channel_id)
        channel.is_original = not channel.is_original
        db.session.commit()
        return jsonify({'status': 'success', 'is_original': channel.is_original})

    @app.route('/api/channels/<int:channel_id>/info')
    def api_channel_detailed_info(channel_id):
        from app.modules.channels.models import Channel
        from app.modules.playlists.models import PlaylistEntry
        
        channel = Channel.query.get_or_404(channel_id)
        memberships = [e.playlist_id for e in PlaylistEntry.query.filter_by(channel_id=channel_id).all()]
        
        return jsonify({
            'status': 'ok',
            'channel': {
                'id': channel.id,
                'name': channel.name,
                'logo_url': channel.logo_url,
                'stream_url': channel.stream_url,
                'group_name': channel.group_name,
                'epg_id': channel.epg_id,
                'proxy_type': channel.proxy_type,
                'is_original': channel.is_original,
                'play_links': {
                    'smart': url_for('channels.play_channel', channel_id=channel.id, token=current_user.api_token, _external=True),
                    'direct': channel.stream_url,
                    'tracking': url_for('channels.track_redirect', channel_id=channel.id, token=current_user.api_token, _external=True),
                    'hls': url_for('channels.proxy_hls_manifest', channel_id=channel.id, token=current_user.api_token, _external=True),
                    'ts': url_for('channels.play_channel', channel_id=channel.id, token=current_user.api_token, forced='ts', _external=True)
                }
            },
            'memberships': memberships
        })

    @app.route('/api/channels/add', methods=['POST'])
    def api_channels_add():
        from app.modules.channels.services import ChannelService
        from app.modules.playlists.services import PlaylistService
        
        data = request.json or {}
        data['owner_id'] = current_user.id
        
        new_ch = ChannelService.create_channel(data)
        if not new_ch:
            return jsonify({'error': 'Duplicate stream URL or invalid data'}), 400
            
        # Sync playlists
        selected_pids = data.get('selected_playlists', [])
        playlist_data = {str(pid): data.get('group_name') for pid in selected_pids}
        PlaylistService.sync_channel_playlists(new_ch.id, playlist_data)
        
        # Trigger immediate health check
        from app.modules.health.services import HealthCheckService
        HealthCheckService.check_stream(new_ch.id)
        
        return jsonify({'status': 'success', 'id': new_ch.id})

    @app.route('/api/channels/<int:channel_id>', methods=['PATCH'])
    def api_channels_update(channel_id):
        from app.modules.channels.services import ChannelService
        from app.modules.playlists.services import PlaylistService
        
        data = request.json or {}
        updated_ch = ChannelService.update_channel(channel_id, data)
        if not updated_ch:
            return jsonify({'error': 'Channel not found'}), 404
            
        # Sync playlists
        selected_pids = data.get('selected_playlists', [])
        playlist_data = {str(pid): data.get('group_name') for pid in selected_pids}
        PlaylistService.sync_channel_playlists(channel_id, playlist_data)
        
        return jsonify({'status': 'success'})

    @app.route('/api/channels/<int:channel_id>/check', methods=['POST'])
    def api_channels_check_single(channel_id):
        from app.modules.health.services import HealthCheckService
        HealthCheckService.check_stream(channel_id)
        from app.modules.channels.models import Channel
        ch = Channel.query.get(channel_id)
        return jsonify({
            'status': ch.status,
            'quality': ch.quality,
            'resolution': ch.resolution,
            'latency': ch.latency,
            'last_checked': ch.last_checked_at.strftime('%Y-%m-%d %H:%M') if ch.last_checked_at else 'Never'
        })

    @app.route('/api/streams/active')
    def api_streams_active():
        from app.modules.channels.services import ActiveSessionManager
        from app.modules.channels.models import Channel
        
        sessions = ActiveSessionManager.get_active_sessions()
        data = []
        for s in sessions:
            ch = Channel.query.get(s['channel_id'])
            data.append({
                'key': s['key'],
                'channel_name': ch.name if ch else 'Unknown',
                'channel_logo': ch.logo_url if ch else None,
                'user': s['user'],
                'ip': s['ip'],
                'type': s['type'],
                'source': s['source'],
                'bandwidth_kbps': s.get('bandwidth_kbps', 0),
                'start_time': s['start_time'].strftime('%H:%M:%S'),
                'duration': str(datetime.now() - s['start_time']).split('.')[0]
            })
        return jsonify(data)

    @app.route('/api/streams/<string:key>', methods=['DELETE'])
    def api_streams_kill(key):
        from app.modules.channels.services import ActiveSessionManager
        success = ActiveSessionManager.remove_session(key)
        return jsonify({'status': 'success' if success else 'failed'})

    @app.route('/api/epg/sources')
    def api_epg_sources():
        from app.modules.channels.services import EPGService
        sources = EPGService.get_sources()
        data = [{
            'id': s.id,
            'name': s.name,
            'url': s.url,
            'last_sync': s.last_sync_at.strftime('%Y-%m-%d %H:%M') if s.last_sync_at else 'Never'
        } for s in sources]
        return jsonify(data)

    @app.route('/api/epg/sources', methods=['POST'])
    def api_epg_add_source():
        from app.modules.channels.services import EPGService
        data = request.json or {}
        source = EPGService.add_source(data.get('name'), data.get('url'))
        return jsonify({'status': 'success', 'id': source.id})

    @app.route('/api/epg/sources/<int:id>', methods=['DELETE'])
    def api_epg_delete_source(id):
        from app.modules.channels.services import EPGService
        success = EPGService.delete_source(id)
        return jsonify({'status': 'success' if success else 'failed'})

    @app.route('/api/epg/sources/<int:id>/sync', methods=['POST'])
    def api_epg_sync_source(id):
        from app.modules.channels.services import EPGService
        # Background task would be better, but EPGService.sync_epg is relatively fast for small files
        # and has its own logging.
        result = EPGService.sync_epg(id)
        return jsonify(result)

    # Player API consolidated in channels module

    @app.route('/api/auth/me')
    def api_auth_me():
        if not current_user.is_authenticated:
            return jsonify({'error': 'Not authenticated'}), 401
        
        return jsonify({
            'id': current_user.id,
            'username': current_user.username,
            'email': getattr(current_user, 'email', ''),
            'role': getattr(current_user, 'role', 'user'),
            'avatar_initial': current_user.username[0].upper() if hasattr(current_user, 'username') and current_user.username else '?'
        })

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
                    # Log conflict but proceed for admin takeover if explicitly requested
                    app.logger.warning(f"Admin takeover: Overwriting central_auth_id {target_user.central_auth_id} with {ca_id} for local ID 1")
                
                # Collision Handling: If email or username is already taken by ANOTHER user
                if email:
                    other_with_email = User.query.filter(User.email == email, User.id != 1).first()
                    if other_with_email:
                        app.logger.warning(f"Sync Conflict: Email {email} taken by User {other_with_email.id}. Renaming existing user.")
                        other_with_email.email = f"{email}_old_{int(time.time())}"
                
                if username:
                    other_with_username = User.query.filter(User.username == username, User.id != 1).first()
                    if other_with_username:
                        app.logger.warning(f"Sync Conflict: Username {username} taken by User {other_with_username.id}. Renaming existing user.")
                        other_with_username.username = f"{username}_old_{int(time.time())}"
                
                if ca_id:
                    other_with_ca = User.query.filter(User.central_auth_id == ca_id, User.id != 1).first()
                    if other_with_ca:
                        app.logger.warning(f"Sync Conflict: CA ID {ca_id} taken by User {other_with_ca.id}. Detaching existing user.")
                        other_with_ca.central_auth_id = None

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
            
            # Allow data_mismatch pushes to update properties
            if username:
                target_user.username = username
            if email:
                target_user.email = email
            if full_name and hasattr(target_user, 'full_name'):
                target_user.full_name = full_name
                
            db.session.commit()
            return jsonify({"status": "success", "message": f"User {target_user.username} synced and linked to CentralAuth ID {ca_id}"}), 200
        
        return jsonify({"error": "User not found for linking"}), 404

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
        username = data.get('username')
        
        user = None
        if email and email != "null":
            user = User.query.filter_by(email=email).first()
        if not user and username and username != "null":
            user = User.query.filter_by(username=username).first()
            
        if not user:
            return jsonify({"error": f"User {username or email} not found"}), 404
        
        db.session.delete(user)
        db.session.commit()
        return jsonify({"status": "ok", "message": f"Deleted {user.username}"}), 200

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
            print("Seeded new admin/admin account.")
        else:
            # Force update password for local fallback fix
            admin.set_password('admin')
            admin.role = 'admin'
            db.session.commit()
            print("Reset existing admin password to 'admin'.")

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
