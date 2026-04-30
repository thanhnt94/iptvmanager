import logging
import re
import time
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from .base import BaseScanner

logger = logging.getLogger('iptv')

class HoiquanScanner(BaseScanner):
    """Scanner for sv2.hoiquan3.live"""
    
    def __init__(self, site_url=None):
        super().__init__(site_url or "https://sv2.hoiquan3.live/trang-chu")
        self.site_url = self.site_url.rstrip('/')
        if not self.site_url.endswith('/trang-chu'):
            self.site_url = urljoin(self.site_url, '/trang-chu')

    def discover(self):
        links = []
        seen_hrefs = set()
        
        try:
            with sync_playwright() as p:
                self._setup_browser(p)
                logger.info(f" [Hoiquan] Discovering on: {self.site_url}")
                self.page.goto(self.site_url, wait_until='networkidle', timeout=60000)
                
                # 1. Wait for match cards to appear
                try:
                    self.page.wait_for_selector("a[href^='/truc-tiep/']", timeout=20000)
                except:
                    logger.warning(" [Hoiquan] No match links found initially.")

                # 2. Deep Scroll to trigger lazy loading
                logger.info(" [Hoiquan] Performing deep scroll...")
                for i in range(10):
                    self.page.keyboard.press('End')
                    self.page.wait_for_timeout(1500)
                
                self.page.wait_for_timeout(3000)
                
                html = self.page.content()
                soup = BeautifulSoup(html, 'html.parser')
                
                # 3. Extract matches
                # Cards are typically <a> tags starting with /truc-tiep/
                cards = soup.select("a[href^='/truc-tiep/']")
                logger.info(f" [Hoiquan] Found {len(cards)} raw cards.")
                
                for card in cards:
                    href = card.get('href')
                    if not href: continue
                    
                    full_url = urljoin(self.site_url, href)
                    if full_url in seen_hrefs: continue

                    # Extract Info: [Team A] [VS] [Team B] [Time] [BLV]
                    # Structure found by subagent:
                    # div:nth-child(2) holds teams and time
                    # div:nth-child(3) holds BLV
                    
                    teams = []
                    match_time = ""
                    blv_name = ""
                    
                    # Try to find team names and time inside the card
                    spans = card.find_all('span')
                    # This is a bit generic, let's try more specific structure if possible
                    # but spans are often safer for these SPAs
                    
                    # Based on subagent info:
                    # div 2 -> team1, time, team2
                    # div 3 -> blv
                    all_divs = card.find_all('div', recursive=False)
                    if not all_divs:
                        # Maybe nested? try to find divs anywhere inside
                        all_divs = card.find_all('div')
                    
                    # Let's use a simpler text-based heuristic for HoiQuan
                    text_content = card.get_text(separator='|', strip=True).split('|')
                    # Usually: [League, Time, Day, Team1, Score, Team2, BLV]
                    # Or variations. 
                    
                    # Better: Parse the card structure specifically
                    # Subagent says: div:nth-child(2) > div:nth-child(1) span is team 1
                    # We'll use BeautifulSoup to find these.
                    
                    team1_el = card.select_one('div:nth-of-type(2) > div:nth-of-type(1) span')
                    team2_el = card.select_one('div:nth-of-type(2) > div:nth-of-type(3) span')
                    time_els = card.select('div:nth-of-type(2) > div:nth-of-type(2) span')
                    blv_el = card.select_one('div:nth-of-type(3) span')
                    
                    team1 = team1_el.get_text(strip=True) if team1_el else ""
                    team2 = team2_el.get_text(strip=True) if team2_el else ""
                    match_time = " ".join([t.get_text(strip=True) for t in time_els]) if time_els else ""
                    blv_name = blv_el.get_text(strip=True) if blv_el else ""
                    
                    if not team1 and not team2:
                        # Fallback to text parsing
                        if len(text_content) >= 5:
                            team1 = text_content[3] if len(text_content) > 3 else ""
                            team2 = text_content[5] if len(text_content) > 5 else ""
                            match_time = text_content[1] if len(text_content) > 1 else ""
                    
                    title = f"[{team1} VS {team2}] [{match_time}]"
                    if blv_name:
                        title += f" [{blv_name.upper()}]"
                    
                    # Cleanup
                    title = title.replace('  ', ' ').strip()
                    if title == "[] []": title = card.get_text(strip=True) or full_url
                    
                    links.append({
                        'url': full_url,
                        'title': title,
                        'blv': blv_name
                    })
                    seen_hrefs.add(full_url)
                
                self.browser.close()
                
            logger.info(f" [Hoiquan] Discovered {len(links)} matches.")
            return links
        except Exception as e:
            logger.error(f" [Hoiquan] Discovery failed: {e}")
            return []

    def extract(self, page_url):
        """Extracts ArtPlayer m3u8 stream from hoiquan match page."""
        try:
            with sync_playwright() as p:
                self._setup_browser(p)
                logger.info(f" [Hoiquan] Extracting from: {page_url}")
                
                # Navigate and wait for network to settle
                self.page.goto(page_url, wait_until='networkidle', timeout=60000)
                self.page.wait_for_timeout(5000) # Wait for ArtPlayer to init
                
                html = self.page.content()
                
                # Regex for ArtPlayer config URL
                # Look for: url: "https://...m3u8"
                m3u8_matches = re.findall(r'url:\s*["\'](https?://[^"\']+\.m3u8[^"\']*)["\']', html)
                
                links = []
                if m3u8_matches:
                    for url in m3u8_matches:
                        links.append({'url': url, 'quality': 'Auto'})
                
                self.browser.close()
                
                if links:
                    logger.info(f" [Hoiquan] Successfully extracted {len(links)} links.")
                    return {'success': True, 'links': links}
                else:
                    logger.warning(" [Hoiquan] No m3u8 links found in page content.")
                    return {'success': False, 'error': 'No stream found'}
                    
        except Exception as e:
            logger.error(f" [Hoiquan] Extraction failed: {e}")
            return {'success': False, 'error': str(e)}
