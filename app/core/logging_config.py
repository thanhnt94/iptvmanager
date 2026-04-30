import logging
import os
from logging.handlers import RotatingFileHandler

class PollingFilter(logging.Filter):
    def filter(self, record):
        try:
            # Silence frequent polling logs from Werkzeug
            msg = record.getMessage()
            if any(path in msg for path in ['/api/health/status', '/api/playlists', '/api/health/scanner-status']):
                return False
        except:
            pass
        return True

def setup_logging(app):
    """Sets up unified logging for the IPTV Manager."""
    log_dir = 'logs'
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
        
    log_file = os.path.join(log_dir, 'iptv.log')
    
    # Format: 2026-03-22 19:41:39 - [iptv] - INFO - Message
    formatter = logging.Formatter('%(asctime)s - [%(name)s] - %(levelname)s - %(message)s')
    
    # File Handler (10MB, 5 backups)
    file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)
    
    # Console Handler (Sạch sẽ hơn, chỉ hiện thông báo quan trọng)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    
    # IPTV Logger
    logger = logging.getLogger('iptv')
    logger.setLevel(logging.DEBUG)
    logger.propagate = True
    
    # Refresh handlers
    logger.handlers = []
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    if app:
        app.logger.handlers = []
        app.logger.addHandler(file_handler)
        app.logger.addHandler(console_handler)
        app.logger.setLevel(logging.DEBUG)

    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    
    logger.info("IPTV Logging system initialized.")
    return logger
