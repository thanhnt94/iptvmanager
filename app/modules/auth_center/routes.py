from flask import Blueprint, request, redirect, url_for, session, flash, current_app, jsonify
from flask_login import login_user, logout_user
from app.core.sso.sso_service import SSOService

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
    This is called when a user logs out globally.
    """
    data = request.get_json()
    # In a real V2 OIDC setup, we would verify the logout_token (JWT)
    # For now, we clear the sessions tracked by this user
    # Note: Flask sessions are cookie-based, so backchannel logout 
    # usually requires a server-side session store or token blacklist.
    # We will implement session invalidation logic if needed.
    return jsonify({"status": "received"}), 200
