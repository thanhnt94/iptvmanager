import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "iptv_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.modules.health.tasks",
        "app.modules.channels.tasks",
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
)

if __name__ == "__main__":
    celery_app.start()
