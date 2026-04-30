from celery import shared_task
from celery.utils.log import get_task_logger
from app.core.database import db
import logging

logger = get_task_logger('iptv')

@shared_task(name='channels.sync_epg_all')
def sync_epg_all_task():
    """
    Celery task to sync all EPG sources.
    """
    from run_iptv import app
    with app.app_context():
        from app.modules.channels.models import EPGSource
        from app.modules.channels.services import EPGService
        
        sources = EPGSource.query.all()
        logger.info(f" [EPG-SYNC] Starting sync for {len(sources)} sources...")
        
        results = []
        for source in sources:
            try:
                logger.info(f" [EPG-SYNC] Syncing: {source.name} ({source.url})")
                res = EPGService.sync_epg(source.id)
                results.append(res)
            except Exception as e:
                logger.error(f" [EPG-SYNC] Failed to sync {source.name}: {e}")
        
        return results

@shared_task(name='channels.sync_epg_single')
def sync_epg_single_task(source_id):
    """
    Celery task to sync a single EPG source.
    """
    from run_iptv import app
    with app.app_context():
        from app.modules.channels.services import EPGService
        return EPGService.sync_epg(source_id)
