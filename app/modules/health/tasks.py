from flask_apscheduler import APScheduler
from app.modules.health.services import HealthCheckService

scheduler = APScheduler()

def init_scheduler(app):
    scheduler.init_app(app)
    scheduler.start()
    
    # Add manual job if not already scheduled
    @scheduler.task('interval', id='check_all_links', hours=6)
    def scheduled_health_check():
        with app.app_context():
            HealthCheckService.check_all_channels()
