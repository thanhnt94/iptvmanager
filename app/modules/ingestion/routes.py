import io
import logging
from flask import Blueprint, request, jsonify, send_file, render_template, redirect, url_for, flash
from flask_login import login_required
from app.modules.ingestion.services import IngestionService
from app.modules.ingestion.data_services import DataExportService, DataImportService

logger = logging.getLogger('iptv')
ingestion_bp = Blueprint('ingestion', __name__)

# Ingestion APIs Only - HTML Routes Purged

@ingestion_bp.route('/export/excel', methods=['GET'])
@login_required
def export_excel():
    from flask_login import current_user
    buffer = DataExportService.export_to_excel(current_user)
    return send_file(
        buffer,
        as_attachment=True,
        download_name='channels_export.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@ingestion_bp.route('/import/excel', methods=['POST'])
@login_required
def import_excel():
    if 'excel_file' in request.files and request.files['excel_file'].filename:
        file = request.files['excel_file']
        visibility = request.form.get('visibility', 'private')
        result = DataImportService.import_from_excel(file, visibility=visibility)
        return jsonify({'status': 'ok', 'result': result})
    
    return jsonify({'status': 'error', 'message': 'No file selected'}), 400

@ingestion_bp.route('/parse-m3u8', methods=['POST'])
@login_required
def parse_m3u8():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Invalid JSON payload'}), 400
            
        source = data.get('source')
        is_url = data.get('is_url', False)
        
        if not source:
            return jsonify({'status': 'error', 'message': 'No source provided'}), 400
            
        logger.info(f"Ingestion: Parsing M3U8 from {'URL' if is_url else 'Direct Content'} (size: {len(source)})")
        channels = IngestionService.parse_m3u8(source, is_url=is_url)
        
        if not channels:
            logger.warning("Ingestion: No channels discovered in the source")
            
        return jsonify({'status': 'ok', 'channels': channels})
    except Exception as e:
        logger.error(f"Ingestion: Parse error: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Server error: {str(e)}'}), 500

@ingestion_bp.route('/commit', methods=['POST'])
@login_required
def commit_import():
    try:
        data = request.get_json()
        channels = data.get('channels', [])
        visibility = data.get('visibility', 'private')
        
        if not channels:
            return jsonify({'status': 'error', 'message': 'No channels provided'}), 400
            
        logger.info(f"Ingestion: Committing {len(channels)} streams with visibility={visibility}")
        result = IngestionService.import_channels(channels, visibility=visibility)
        return jsonify({'status': 'ok', **result})
    except Exception as e:
        logger.error(f"Ingestion: Commit error: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Commit failed: {str(e)}'}), 500
