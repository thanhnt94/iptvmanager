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
    from app.modules.channels.services import EPGService
    return EPGService.sync_epg(source_id)

@shared_task(name='channels.bulk_media_scan', bind=True)
def bulk_media_scan_task(self, site_url, deep_scan=False):
    """
    Celery task to discover and extract media from multiple links on a site.
    """
    from app.modules.channels.services import ExtractorService
    import time

    self.update_state(state='PROGRESS', meta={'current': 0, 'total': 0, 'status': 'Discovering links...'})
    
    # 1. Discover sub-links
    discovered = ExtractorService.discover_links(site_url)
    total = len(discovered)
    
    if total == 0:
        # Fallback: maybe the URL itself is the only link
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
            
            # Extract media from this sub-link
            # Note: We use deep_scan parameter here
            res = ExtractorService.extract_direct_url(item['url'], deep_scan=deep_scan)
            
            if res.get('success'):
                # Merge item info with extraction result
                results.append({
                    'original_title': item['title'],
                    'blv': item['blv'],
                    'page_url': item['url'],
                    'media_title': res.get('title'),
                    'links': res.get('links')
                })
            
            # Small delay to avoid hammering the site
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
    """
    Background task to sync a dynamic website-based playlist.
    """
    from app.modules.playlists.models import PlaylistProfile, PlaylistEntry, PlaylistGroup
    from app.modules.channels.models import Channel
    from app.modules.channels.scanners.factory import get_scanner
    from datetime import datetime
    import time
    
    profile = PlaylistProfile.query.get(playlist_id)
    if not profile or not profile.is_dynamic:
        return {'success': False, 'error': 'Invalid playlist'}

    try:
        from app.modules.health.models import ScannerStatus
        from app.modules.playlists.models import DiscoveryChannel
        
        status_state = ScannerStatus.get_singleton()
        status_state.is_running = True
        status_state.playlist_id = playlist_id
        status_state.current = 0
        status_state.total = 0
        status_state.current_name = "Initializing scanner..."
        db.session.commit()

        profile.is_scanning = True
        profile.current_scanning_name = "Discovering content..."
        db.session.commit()

        # 1. Initialize Scanner
        scanner = get_scanner(profile.scanner_type or 'generic', profile.website_url)
        
        status_state.current_name = "Discovering matches from website..."
        db.session.commit()
        
        discovered = scanner.discover()
        
        if not discovered:
            profile.is_scanning = False
            profile.current_scanning_name = None
            status_state.is_running = False
            db.session.commit()
            return {'success': True, 'found': 0}

        total = len(discovered)
        status_state.total = total
        status_state.current_name = f"Discovered {total} matches. Starting extraction..."
        db.session.commit()
        
        # 2. Clear OLD discovery items for this playlist (User wants fresh list from scan)
        DiscoveryChannel.query.filter_by(playlist_id=playlist_id).delete()
        db.session.commit()

        # 3. Process each discovered item
        added_count = 0
        for idx, item in enumerate(discovered):
            # Update status BEFORE extraction (extraction is slow!)
            status_msg = f"Extracting ({idx+1}/{total}): {item['title']}"
            profile.current_scanning_name = status_msg
            status_state.current = idx + 1
            status_state.current_name = f"Extracting: {item['title']}"
            db.session.commit()
            
            # 4. Extract direct stream
            logger.info(f" [DYNAMIC-SYNC] {status_msg}")
            extract_res = scanner.extract(item['url'])
            
            if extract_res.get('success') and extract_res.get('links'):
                best_link = extract_res['links'][0]['url']
                
                # 5. Save to DiscoveryChannel (Independent storage)
                new_item = DiscoveryChannel(
                    playlist_id=playlist_id,
                    name=item['title'],
                    stream_url=best_link,
                    origin_url=item['url'],
                    status='live'
                )
                db.session.add(new_item)
                added_count += 1
                
                # Update status AFTER save
                status_state.current_name = f"Saved: {item['title']}"
                db.session.commit()
                
            time.sleep(1)

        profile.is_scanning = False
        profile.current_scanning_name = None
        profile.last_synced_at = datetime.utcnow()
        status_state.is_running = False
        db.session.commit()
        
        return {'success': True, 'added': added_count}
        
    except Exception as e:
        db.session.rollback()
        logger.error(f" [DYNAMIC-SYNC] Fatal Error: {e}", exc_info=True)
        profile.is_scanning = False
        profile.current_scanning_name = f"Error: {str(e)[:50]}"
        try:
            status_state.is_running = False
            db.session.commit()
        except: pass

@shared_task(name='channels.single_media_scan', bind=True)
def single_media_scan_task(self, url, deep_scan=False):
    """
    Celery task to extract media from a single URL.
    """
    from app.modules.channels.services import ExtractorService
    self.update_state(state='PROGRESS', meta={'status': 'Initializing Ultra Engine...'})
    res = ExtractorService.extract_direct_url(url, deep_scan=deep_scan)
    return res
