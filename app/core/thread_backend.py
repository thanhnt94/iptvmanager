"""
Thread Backend — Lightweight alternative to Celery for background task execution.
Uses Python threading + Flask app context to run tasks without external dependencies.
Zero RAM overhead compared to Celery worker (~50-100MB) + broker (~20-30MB).
"""
import threading
import uuid
import time
import logging
from datetime import datetime

import inspect

logger = logging.getLogger('iptv')


class ThreadTaskResult:
    """Mimics Celery AsyncResult interface for compatibility."""
    
    def __init__(self, task_id, task_name):
        self.id = task_id
        self.task_name = task_name
        self.state = 'PENDING'
        self.info = {}
        self.result = None
        self._error = None
        self._started_at = datetime.utcnow()
    
    def update_state(self, state, meta=None):
        """Compatible with Celery's self.update_state()."""
        self.state = state
        if meta:
            self.info = meta
    
    def mark_success(self, result):
        self.state = 'SUCCESS'
        self.result = result
        self.info = result if isinstance(result, dict) else {}
    
    def mark_failure(self, error):
        self.state = 'FAILURE'
        self._error = error
        self.info = str(error)


class ThreadBackend:
    """
    Runs tasks in daemon threads with Flask app context.
    Tracks active/completed tasks for status queries.
    """
    _tasks = {}  # task_id -> ThreadTaskResult
    _lock = threading.Lock()
    _MAX_COMPLETED_TASKS = 100  # Prevent memory leak from old results
    
    @classmethod
    def run(cls, task_func, app, *args, **kwargs):
        """
        Execute a Celery-compatible task function in a background thread.
        
        For tasks decorated with @shared_task(bind=True), the function expects
        `self` as the first argument. We pass a ThreadTaskResult as `self`.
        
        Returns: ThreadTaskResult (mimics Celery AsyncResult)
        """
        task_id = str(uuid.uuid4())
        task_name = getattr(task_func, 'name', None) or getattr(task_func, '__name__', 'unknown')
        result = ThreadTaskResult(task_id, task_name)
        
        # Determine the actual function to run
        run_func = getattr(task_func, 'run', task_func)
        
        # Robust detection of bound tasks
        # A task is bound if 'bind=True' was set in the decorator, OR
        # if the function signature explicitly takes 'self' as the first argument.
        celery_bind = getattr(task_func, 'bind', False)
        # Celery Task objects have a 'bind' method by default, which is truthy.
        # We only care if it's a boolean set to True.
        if not isinstance(celery_bind, bool):
            celery_bind = False
        
        # Check signature for 'self'
        is_bound = False
        params = []
        try:
            sig = inspect.signature(run_func)
            params = list(sig.parameters.keys())
            if params and params[0] == 'self':
                is_bound = True
            elif celery_bind:
                # If Celery explicitly says it's bound, we trust it.
                is_bound = True
        except Exception as e:
            logger.debug(f" [THREAD-DEBUG] Signature inspection failed for {task_name}: {e}")
            is_bound = celery_bind

        def _worker():
            with app.app_context():
                try:
                    result.state = 'STARTED'
                    logger.info(f" [THREAD-BACKEND] Starting task: {task_name} (ID: {task_id[:8]})")
                    logger.info(f" [THREAD-DEBUG] Task: {task_name} | run_func: {run_func} | Params: {params} | CeleryBind: {celery_bind} | IsBound: {is_bound}")
                    
                    if is_bound:
                        # Pass result as 'self' for bound tasks
                        logger.debug(f" [THREAD-DEBUG] Calling {task_name} as bound task (passing result as self)")
                        ret = run_func(result, *args, **kwargs)
                    else:
                        # Standard task
                        logger.debug(f" [THREAD-DEBUG] Calling {task_name} as standard task")
                        ret = run_func(*args, **kwargs)
                    
                    result.mark_success(ret)
                    logger.info(f" [THREAD-BACKEND] Task completed: {task_name} (ID: {task_id[:8]})")
                except Exception as e:
                    result.mark_failure(e)
                    logger.error(f" [THREAD-BACKEND] Task failed: {task_name} (ID: {task_id[:8]}) — {e}", exc_info=True)
                finally:
                    cls._cleanup_old_tasks()
        
        with cls._lock:
            cls._tasks[task_id] = result
        
        t = threading.Thread(target=_worker, daemon=True, name=f"task-{task_name}-{task_id[:8]}")
        t.start()
        
        return result
    
    @classmethod
    def get_result(cls, task_id):
        """Get a task result by ID (compatible with Celery AsyncResult lookup)."""
        with cls._lock:
            return cls._tasks.get(task_id)
    
    @classmethod
    def get_active_tasks(cls):
        """Returns list of currently running tasks."""
        with cls._lock:
            return [
                {
                    'id': tid,
                    'name': t.task_name,
                    'state': t.state,
                    'info': t.info,
                    'started_at': t._started_at.isoformat()
                }
                for tid, t in cls._tasks.items()
                if t.state in ('PENDING', 'STARTED', 'PROGRESS')
            ]
    
    @classmethod
    def _cleanup_old_tasks(cls):
        """Remove completed tasks beyond the max limit to prevent memory leaks."""
        with cls._lock:
            completed = [
                (tid, t) for tid, t in cls._tasks.items()
                if t.state in ('SUCCESS', 'FAILURE')
            ]
            if len(completed) > cls._MAX_COMPLETED_TASKS:
                # Remove oldest completed tasks
                completed.sort(key=lambda x: x[1]._started_at)
                for tid, _ in completed[:len(completed) - cls._MAX_COMPLETED_TASKS]:
                    del cls._tasks[tid]
