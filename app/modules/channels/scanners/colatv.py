from .base import BaseScanner, logger
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import time

class ColatvScanner(BaseScanner):
    """Specialized scanner for Colatv structure."""

    def discover(self):
        links = []
        seen_hrefs = set()
        
        try:
            with sync_playwright() as p:
                self._setup_browser(p)
                logger.info(f" [Colatv] Discovering on: {self.site_url}")
                self.page.goto(self.site_url, wait_until='networkidle', timeout=60000)
                
                # 1. Wait for matches to start appearing anywhere
                try:
                    self.page.wait_for_selector('a.link-match', timeout=20000)
                except:
                    logger.warning(" [Colatv] No link-match found, checking DOM anyway.")

                # 2. Deep Scroll (15 steps) to trigger all lazy loading
                logger.info(" [Colatv] Performing deep scroll to load all 99+ matches...")
                for i in range(15):
                    self.page.keyboard.press('End')
                    self.page.wait_for_timeout(1500)
                    if i % 5 == 0:
                        logger.info(f" [Colatv] Scroll progress: {i+1}/15")
                
                self.page.wait_for_timeout(3000)
                
                html = self.page.content()
                soup = BeautifulSoup(html, 'html.parser')
                
                # 3. Capture EVERYTHING in DOM order (Hero Slider matches come FIRST)
                cards = soup.select('a.link-match')
                logger.info(f" [Colatv] Found {len(cards)} total match cards in DOM.")
                
                for card in cards:
                    href = card.get('href')
                    if not href or 'javascript' in href.lower(): continue
                    
                    full_url = urljoin(self.site_url, href)
                    if full_url in seen_hrefs: continue

                    # BLV extraction: look in the same card-item container
                    blv_name = None
                    parent = card.find_parent(class_=['match-item', 'match-card-item', 'card-item', 'card', 'hero-slider-item'])
                    if parent:
                        blv_el = parent.select_one('.blv-link, a[href*="houseId"]')
                        if blv_el:
                            blv_name = blv_el.get_text(strip=True)
                    
                    if not blv_name:
                        curr = card.parent
                        for _ in range(6):
                            if not curr: break
                            blv_el = curr.select_one('.blv-link, a[href*="houseId"]')
                            if blv_el:
                                blv_name = blv_el.get_text(strip=True)
                                break
                            curr = curr.parent
                    
                    # 4. Smart Title Extraction from URL Slug
                    title = ""
                    try:
                        # Extract teams and time from slug: .../truc-tiep/team-a-vs-team-b-luc-hhmm-...
                        slug = full_url.split('/truc-tiep/')[1].split('?')[0]
                        slug_parts = slug.split('-')
                        vs_idx = -1
                        luc_idx = -1
                        for i, part in enumerate(slug_parts):
                            if part.lower() == 'vs': vs_idx = i
                            if part.lower() == 'luc': luc_idx = i
                        
                        if vs_idx != -1 and luc_idx != -1:
                            teams = " ".join(slug_parts[:luc_idx]).replace(' vs ', ' VS ').upper()
                            time_str = slug_parts[luc_idx+1]
                            if len(time_str) == 4: # 2055 -> 20:55
                                time_str = f"{time_str[:2]}:{time_str[2:]}"
                            title = f"[{teams}] [{time_str}]"
                    except:
                        pass
                        
                    if not title:
                        title = card.get_text(separator=' ', strip=True) or full_url
                    
                    if blv_name and blv_name.upper() not in title.upper():
                        title = f"{title} [{blv_name.upper()}]"
                    
                    if len(title) > 120: title = title[:117] + "..."
                    
                    links.append({'url': full_url, 'title': title, 'blv': blv_name})
                    seen_hrefs.add(full_url)
                
                self.browser.close()
                
            logger.info(f" [Colatv] Discovered {len(links)} unique matches in full page order.")
            return links
        except Exception as e:
            logger.error(f" [Colatv] Discovery failed: {e}")
            return []
            return []

    def extract(self, page_url):
        """Reuses the existing deep extraction logic but optimized for Colatv."""
        # For now, we can use the generic extraction or customize it if needed
        # Since extract_direct_url is already quite good, we'll call it
        from app.modules.channels.services import ExtractorService
        return ExtractorService.extract_direct_url(page_url, deep_scan=True)
