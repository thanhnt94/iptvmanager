"""
TaskDispatcher — Central abstraction layer for background task execution.
Supports two backends:
  - 'celery': Uses Celery worker + broker (Redis/SQLite). Requires separate process.
  - 'thread': Uses Python threading. Zero overhead, no external dependencies.
  - 'auto': Auto-detects Celery availability; falls back to threading.
"""
import time
import logging
from flask import current_app

logger = logging.getLogger('iptv')


class TaskDispatcher:
    """
    Central task dispatcher with auto-detection.
    
    Usage:
        # Instead of: task_func.delay(arg1, arg2)
        # Use:        TaskDispatcher.dispatch(task_func, arg1, arg2)
    
    The dispatcher will route the task to the active backend
    based on the TASK_BACKEND setting (auto/celery/thread).
    """
    
    _celery_available = None  # Cached detection result
    _celery_checked_at = 0    # Timestamp of last check
    _CACHE_TTL = 60           # Re-check Celery availability every 60 seconds
    
    @classmethod
    def get_backend(cls) -> str:
        """Returns 'celery' or 'thread' based on settings + auto-detection."""
        try:
            from app.modules.settings.services import SettingService
            preference = SettingService.get('TASK_BACKEND', 'auto')
        except Exception:
            preference = 'auto'
        
        if preference == 'celery':
            return 'celery'
        elif preference == 'thread':
            return 'thread'
        else:  # 'auto'
            return 'celery' if cls._is_celery_available() else 'thread'
    
    @classmethod
    def _is_celery_available(cls) -> bool:
        """
        Ping Celery worker with a short timeout.
        Results are cached for 60 seconds to avoid spamming.
        """
        now = time.time()
        if cls._celery_available is not None and (now - cls._celery_checked_at) < cls._CACHE_TTL:
            return cls._celery_available
        
        try:
            app = current_app._get_current_object()
            celery = app.celery_app
            # ping() returns a list of dicts from each worker, timeout in seconds
            response = celery.control.ping(timeout=2.0)
            cls._celery_available = bool(response)
            if cls._celery_available:
                logger.debug(" [DISPATCHER] Celery worker detected: ONLINE")
            else:
                logger.debug(" [DISPATCHER] Celery worker not responding. Falling back to threading.")
        except Exception as e:
            logger.debug(f" [DISPATCHER] Celery ping failed ({e}). Using thread backend.")
            cls._celery_available = False
        
        cls._celery_checked_at = now
        return cls._celery_available
    
    @classmethod
    def invalidate_cache(cls):
        """Force re-detection on next dispatch (e.g., when user changes settings)."""
        cls._celery_available = None
        cls._celery_checked_at = 0
    
    @classmethod
    def dispatch(cls, task_func, *args, **kwargs):
        """
        Dispatch a task to the active backend.
        
        Args:
            task_func: A Celery shared_task decorated function.
            *args, **kwargs: Arguments to pass to the task.
            
        Returns:
            - Celery mode: Celery AsyncResult
            - Thread mode: ThreadTaskResult (same interface)
        """
        backend = cls.get_backend()
        
        if backend == 'celery':
            try:
                result = task_func.delay(*args, **kwargs)
                logger.debug(f" [DISPATCHER] Task dispatched via Celery: {task_func.name} (ID: {result.id[:8]})")
                return result
            except Exception as e:
                # Celery dispatch failed (e.g., broker down) — auto-fallback to thread
                logger.warning(f" [DISPATCHER] Celery dispatch failed ({e}). Falling back to thread backend.")
                cls._celery_available = False
                cls._celery_checked_at = time.time()
                backend = 'thread'
        
        # Thread backend
        from app.core.thread_backend import ThreadBackend
        app = current_app._get_current_object()
        result = ThreadBackend.run(task_func, app, *args, **kwargs)
        logger.debug(f" [DISPATCHER] Task dispatched via Thread: {getattr(task_func, 'name', '?')} (ID: {result.id[:8]})")
        return result
    
    @classmethod
    def get_task_result(cls, task_id):
        """
        Get task result by ID, checking both backends.
        Returns an object with .state, .info, .result attributes.
        """
        # 1. Try thread backend first (fast, in-memory)
        from app.core.thread_backend import ThreadBackend
        thread_result = ThreadBackend.get_result(task_id)
        if thread_result:
            return thread_result
        
        # 2. Try Celery backend
        try:
            app = current_app._get_current_object()
            celery = app.celery_app
            return celery.AsyncResult(task_id)
        except Exception:
            return None
    
    @classmethod
    def get_status_info(cls):
        """
        Returns comprehensive status info for the admin panel.
        """
        backend = cls.get_backend()
        
        info = {
            'active_backend': backend,
            'celery_available': cls._is_celery_available(),
        }
        
        # Get active thread tasks
        from app.core.thread_backend import ThreadBackend
        info['thread_tasks'] = ThreadBackend.get_active_tasks()
        
        try:
            from app.modules.settings.services import SettingService
            info['configured_preference'] = SettingService.get('TASK_BACKEND', 'auto')
        except Exception:
            info['configured_preference'] = 'auto'
        
        return info
