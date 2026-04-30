import logging
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
from bs4 import BeautifulSoup

logger = logging.getLogger('iptv')

class BaseScanner:
    """Base class for all website scanners."""
    
    def __init__(self, site_url):
        self.site_url = site_url
        self.browser = None
        self.context = None
        self.page = None

    def _setup_browser(self, p):
        self.browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        self.context = self.browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        )
        self.page = self.context.new_page()
        stealth = Stealth()
        stealth.apply_stealth_sync(self.page)
        
        # Block images/fonts to save bandwidth
        self.page.route("**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}", lambda route: route.abort())

    def discover(self):
        """Should return a list of dicts: {'url': ..., 'title': ..., 'blv': ...}"""
        raise NotImplementedError

    def extract(self, page_url):
        """Should return a dict with direct stream links."""
        raise NotImplementedError
