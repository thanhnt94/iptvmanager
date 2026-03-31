from flask import Blueprint, request, redirect, url_for, session, flash, current_app, jsonify
from flask_login import login_user, logout_user
from app.core.sso.sso_service import SSOService
from app.modules.auth.models import UserSession, User
from app.core.database import db
import jwt
import time

auth_center_bp = Blueprint('auth_center', __name__)

@auth_center_bp.route('/login')
def login():
    """Redirect to CentralAuth Login Page."""
    callback_url = url_for('auth_center.callback', _external=True)
    client = SSOService.get_client()
    login_url = client.get_login_url(callback_url)
    
    if not login_url:
        flash("SSO Configuration is missing.", "danger")
        return redirect(url_for('auth.login'))
        
    return redirect(login_url)

@auth_center_bp.route('/callback')
def callback():
    """Handle the callback from CentralAuth."""
    code = request.args.get('code')
    if not code:
        flash("Authorization failed. No code received.", "danger")
        return redirect(url_for('auth.login'))
        
    try:
        user = SSOService.handle_callback(code)
        if user:
            login_user(user)
            
            # Store Session ID for Back-channel logout tracking (Skip if already exists)
            if hasattr(session, 'sid'):
                existing_sess = UserSession.query.filter_by(session_id=session.sid).first()
                if not existing_sess:
                    new_sess = UserSession(user_id=user.id, session_id=session.sid)
                    db.session.add(new_sess)
                    db.session.commit()
            
            flash(f"Chào mừng quay lại, {user.username}!", "success")
            return redirect(url_for('channels.index'))
    except Exception as e:
        current_app.logger.error(f"IPTV SSO Callback Error: {e}")
        flash("An error occurred during SSO login.", "danger")
        
    return redirect(url_for('auth.login'))

@auth_center_bp.route('/webhook/backchannel-logout', methods=['POST'])
def backchannel_logout():
    """
    Handle remote logout requests from CentralAuth.
    Verifies the JWT 'logout_token' and clears indexed server-side sessions.
    """
    data = request.get_json()
    logout_token = data.get('logout_token')
    
    if not logout_token:
        return jsonify({"error": "Missing logout_token"}), 400
        
    try:
        # Get the same JWT secret used by CentralAuth
        # In a real setup, this would be a public key or shared secret in config
        from app.modules.settings.models import SystemSetting
        secret = SystemSetting.get_value('CENTRAL_AUTH_CLIENT_SECRET') or current_app.config['SECRET_KEY']
        
        # Verify and decode
        payload = jwt.decode(logout_token, secret, algorithms=['HS256'])
        user_id = payload.get('sub') # This is the CentralAuth User ID
        
        if not user_id:
            return jsonify({"error": "Invalid token payload"}), 400

        # 1. Find local user by CentralAuth ID (if they match, or use username)
        # Assuming for now they match or we find via email/username
        # Let's try finding all sessions associated with this user
        # We need a robust mapping in V2
        
        # For this demonstration, we'll clear sessions for the specific user_id
        # if our local user.id matches.
        user_sessions = UserSession.query.filter_by(user_id=user_id).all()
        session_ids = [s.session_id for s in user_sessions]
        
        if session_ids:
            # Delete from flask-session table ('sessions')
            # Using raw SQL to be safe as flask-session doesn't expose the model easily
            # 'sessions' is the table name we configured in config.py
            db.session.execute(db.text("DELETE FROM sessions WHERE session_id IN :ids"), {"ids": tuple(session_ids)})
            # Delete our tracking records
            UserSession.query.filter(UserSession.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.session.commit()
            
            current_app.logger.info(f"Back-channel Logout: Invalidated {len(session_ids)} sessions for user {user_id}")
        
        return jsonify({"status": "success", "invalidated": len(session_ids)}), 200
        
    except Exception as e:
        current_app.logger.error(f"Back-channel Logout Exception: {e}")
        return jsonify({"error": str(e)}), 500
