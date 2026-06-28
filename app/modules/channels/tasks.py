import logging
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger('iptv')

@shared_task(name='channels.sync_epg_all')
def sync_epg_all_task():
    """Celery task to sync all EPG sources."""
    from app.modules.channels.models import EPGSource
    from app.modules.channels.services import EPGService
    from app.core.database import SessionFactory
    
    db = SessionFactory()
    try:
        sources = db.query(EPGSource).all()
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
    finally:
        db.close()

@shared_task(name='channels.sync_epg_single')
def sync_epg_single_task(source_id):
    """Celery task to sync a single EPG source."""
    from app.modules.channels.services import EPGService
    return EPGService.sync_epg(source_id)

@shared_task(name='channels.bulk_media_scan', bind=True)
def bulk_media_scan_task(self, site_url, deep_scan=False):
    """Celery task to discover and extract media from multiple links on a site."""
    from app.modules.channels.services import ExtractorService
    import time

    self.update_state(state='PROGRESS', meta={'current': 0, 'total': 0, 'status': 'Discovering links...'})
    discovered = ExtractorService.discover_links(site_url)
    total = len(discovered)
    
    if total == 0:
        discovered = [{'url': site_url, 'title': 'Direct Link', 'blv': None}]
        total = 1

    self.update_state(state='PROGRESS', meta={'current': 0, 'total': total, 'status': f'Found {total} links. Starting extraction...'})
    
    results = []
    for idx, item in enumerate(discovered):
        try:
            self.update_state(state='PROGRESS', meta={
                'current': idx + 1, 
                'total': total, 
                'status': f'Extracting ({idx+1}/{total}): {item["title"]}'
            })
            res = ExtractorService.extract_direct_url(item['url'], deep_scan=deep_scan)
            if res.get('success'):
                results.append({
                    'original_title': item['title'],
                    'blv': item['blv'],
                    'page_url': item['url'],
                    'media_title': res.get('title'),
                    'links': res.get('links')
                })
            time.sleep(0.5)
        except Exception as e:
            logger.error(f"Bulk Scan Error for {item['url']}: {e}")
    
    return {
        'success': True,
        'total_found': total,
        'results_count': len(results),
        'data': results
    }

@shared_task(name='channels.sync_dynamic_playlist', bind=True)
def sync_dynamic_playlist_task(self, playlist_id):
    return {'success': True, 'added': 0}

@shared_task(name='channels.single_media_scan', bind=True)
def single_media_scan_task(self, url, deep_scan=False):
    """Celery task to extract media from a single URL."""
    from app.modules.channels.services import ExtractorService
    self.update_state(state='PROGRESS', meta={'status': 'Initializing Ultra Engine...'})
    return ExtractorService.extract_direct_url(url, deep_scan=deep_scan)
