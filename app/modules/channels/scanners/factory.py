from .colatv import ColatvScanner
from .hoiquan import HoiquanScanner
from .generic import GenericScanner

def get_scanner(scanner_type, site_url):
    """Returns the appropriate scanner instance."""
    scanners = {
        'colatv': ColatvScanner,
        'hoiquan': HoiquanScanner,
        'generic': GenericScanner
    }
    
    scanner_class = scanners.get(scanner_type.lower(), GenericScanner)
    return scanner_class(site_url)
