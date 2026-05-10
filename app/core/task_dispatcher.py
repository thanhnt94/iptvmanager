"""
TaskDispatcher  — Thread-only background task execution.
No Flask or Celery dependency.
"""
import os
import time
import uuid
import logging
import threading
from typing import Any, Dict, List

logger = logging.getLogger('iptv')


class ThreadTaskResult:
    """Mimics Celery's AsyncResult interface."""
    def __init__(self, task_id: str):
        self.id = task_id
        self.state = 'PENDING'
        self.info = {}
        self.result = None


from concurrent.futures import ThreadPoolExecutor

class TaskDispatcher:
    """Thread-based task dispatcher with a pool."""

    _executor = ThreadPoolExecutor(max_workers=10)
    _active_tasks: Dict[str, dict] = {}
    _results: Dict[str, ThreadTaskResult] = {}
    _lock = threading.Lock()

    @classmethod
    def dispatch(cls, task_func, *args, **kwargs) -> ThreadTaskResult:
        """
        Dispatches a task. Uses Celery if USE_CELERY is true and task is a Celery task.
        Otherwise uses internal ThreadPool.
        """
        use_celery = os.getenv("USE_CELERY", "false").lower() == "true"
        
        # If it's a Celery task (has .delay method) and celery is enabled
        if use_celery and hasattr(task_func, 'delay'):
            try:
                celery_result = task_func.delay(*args, **kwargs)
                logger.debug(f"[DISPATCHER] Task dispatched to CELERY: {task_func.__name__} (ID: {celery_result.id})")
                return ThreadTaskResult(celery_result.id) # Mimic result
            except Exception as e:
                logger.error(f"[DISPATCHER] Failed to dispatch to Celery: {e}. Falling back to Thread.")

        # Fallback to ThreadPool
        task_id = str(uuid.uuid4())
        result = ThreadTaskResult(task_id)
        result.state = 'STARTED'

        with cls._lock:
            cls._results[task_id] = result
            cls._active_tasks[task_id] = {
                'id': task_id,
                'name': getattr(task_func, '__name__', str(task_func)),
                'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            }

        def _run_wrapper():
            try:
                # If it's a celery task but we are running in thread mode, call the underlying func
                if hasattr(task_func, 'run'):
                    ret = task_func.run(*args, **kwargs)
                else:
                    ret = task_func(*args, **kwargs)
                    
                with cls._lock:
                    result.state = 'SUCCESS'
                    result.result = ret
                    result.info = ret if isinstance(ret, dict) else {}
            except Exception as e:
                logger.error(f"[DISPATCHER] Task {task_id} failed: {e}", exc_info=True)
                with cls._lock:
                    result.state = 'FAILURE'
                    result.info = str(e)
            finally:
                with cls._lock:
                    cls._active_tasks.pop(task_id, None)

        cls._executor.submit(_run_wrapper)
        logger.debug(f"[DISPATCHER] Task queued in THREAD pool: {cls._active_tasks.get(task_id, {}).get('name')} (ID: {task_id[:8]})")
        return result

    @classmethod
    def get_task_result(cls, task_id: str):
        with cls._lock:
            return cls._results.get(task_id)

    @classmethod
    def get_active_tasks(cls) -> List[dict]:
        with cls._lock:
            return list(cls._active_tasks.values())

    @classmethod
    def get_status_info(cls) -> dict:
        return {
            'active_backend': 'thread',
            'celery_available': False,
            'thread_tasks': cls.get_active_tasks(),
            'configured_preference': 'thread',
        }

    @classmethod
    def invalidate_cache(cls):
        pass  # No cache to invalidate in thread-only mode

