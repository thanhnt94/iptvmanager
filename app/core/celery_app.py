from celery import Celery, Task
from flask import Flask

def celery_init_app(app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args: object, **kwargs: object) -> object:
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app = Celery(app.name, task_cls=FlaskTask)
    celery_app.config_from_object(app.config.get('CELERY', {
        'broker_url': app.config.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
        'result_backend': app.config.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
        'task_ignore_result': True,
    }))
    celery_app.set_default()
    app.extensions["celery"] = celery_app

    # Use the app's logging setup for Celery workers
    from celery.signals import setup_logging
    @setup_logging.connect
    def on_setup_logging(**kwargs):
        from app.core.logging_config import setup_logging as init_logs
        init_logs(app)

    return celery_app
