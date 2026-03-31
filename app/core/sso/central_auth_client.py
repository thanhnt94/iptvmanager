import requests
from flask import current_app

class CentralAuthClient:
    """
    Client for CentralAuth Single Sign-On (V2).
    Handles discovery, code exchange, and token verification.
    """

    def __init__(self, api_url, web_url=None, client_id=None, client_secret=None):
        # Robust URL cleaning
        def clean_url(url):
            if not url: return None
            cleaned = url.rstrip('/')
            for suffix in ['/api/auth/login', '/api/auth/verify-token', '/api/auth']:
                if cleaned.endswith(suffix):
                    cleaned = cleaned[:len(cleaned)-len(suffix)]
            return cleaned.rstrip('/')

        self.api_url = clean_url(api_url)
        self.web_url = clean_url(web_url or api_url)
        self.client_id = client_id
        self.client_secret = client_secret

    def get_login_url(self, callback_url):
        """Generates the redirect URL for the CentralAuth login page."""
        if not self.web_url:
            return None
        return f"{self.web_url}/api/auth/login?return_to={callback_url}&client_id={self.client_id}"

    def check_health(self):
        """Checks if the CentralAuth server is reachable."""
        if not self.api_url:
            return False
        try:
            response = requests.get(f"{self.api_url}/api/auth/health", timeout=2)
            return response.status_code == 200
        except:
            return False

    def exchange_code_for_token(self, code):
        """Exchanges an authorization code for tokens."""
        if not self.api_url or not self.client_id or not self.client_secret:
            return None

        try:
            response = requests.post(
                f"{self.api_url}/api/auth/token",
                json={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret
                },
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            if current_app:
                current_app.logger.error(f"IPTV SSO Token Exchange Error: {e}")
        return None

    def verify_token(self, token):
        """Verifies an access token and returns user info."""
        if not self.api_url:
            return None
            
        try:
            response = requests.get(
                f"{self.api_url}/api/auth/verify-token",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5
            )
            if response.status_code == 200:
                return response.json().get('user')
        except Exception as e:
            if current_app:
                current_app.logger.error(f"IPTV SSO Token Verification Error: {e}")
        return None
