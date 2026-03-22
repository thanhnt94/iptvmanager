from app.modules.auth.models import User
from app.core.database import db

class AuthService:
    @staticmethod
    def ensure_admin_user():
        """Creates the default admin/admin user if it doesn't exist."""
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(username='admin')
            admin.set_password('admin')
            db.session.add(admin)
            db.session.commit()
            return True
        return False

    @staticmethod
    def get_user_by_id(user_id):
        return User.query.get(int(user_id))

    @staticmethod
    def get_user_by_username(username):
        return User.query.filter_by(username=username).first()
