from .base import BaseScanner, logger
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from urllib.parse import urljoin

class GenericScanner(BaseScanner):
    """Fallback scanner for unknown sites."""

    def discover(self):
        links = []
        seen_hrefs = set()
        
        try:
            with sync_playwright() as p:
                self._setup_browser(p)
                logger.info(f" [Generic] Discovering on: {self.site_url}")
                self.page.goto(self.site_url, wait_until='domcontentloaded', timeout=30000)
                self.page.wait_for_timeout(5000)
                
                html = self.page.content()
                soup = BeautifulSoup(html, 'html.parser')
                
                all_links = soup.find_all('a', href=True)
                for a in all_links:
                    href = a['href']
                    text = a.get_text(strip=True)
                    full_url = urljoin(self.site_url, href)
                    
                    if any(x in href.lower() for x in ['facebook', 'twitter', 'ads', 'telegram', 'bet']):
                        continue
                        
                    is_likely = False
                    h_low = href.lower()
                    if any(x in h_low for x in ['truc-tiep', '/live', '/match', 'stream', 'xem-phim', 'tap-']):
                        is_likely = True
                    
                    if is_likely and full_url not in seen_hrefs:
                        links.append({'url': full_url, 'title': text or full_url, 'blv': None})
                        seen_hrefs.add(full_url)
                
                self.browser.close()
            return links
        except Exception as e:
            logger.error(f" [Generic] Discovery failed: {e}")
            return []

    def extract(self, page_url):
        from app.modules.channels.services import ExtractorService
        return ExtractorService.extract_direct_url(page_url, deep_scan=True)
