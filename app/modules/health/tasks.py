from flask_apscheduler import APScheduler

scheduler = APScheduler()

def init_scheduler(app):
    """
    Initializes the scheduler for tasks like EPG sync.
    Periodic health checks have been removed in favor of manual background scanning.
    """
    scheduler.init_app(app)
    scheduler.start()
