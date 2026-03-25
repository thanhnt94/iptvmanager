from app import create_app
from app.modules.auth.models import TrustedIP
app = create_app()
with app.app_context():
    ips = [t.ip_address for t in TrustedIP.query.all()]
    print(f"TRUSTED_IPS: {ips}")
