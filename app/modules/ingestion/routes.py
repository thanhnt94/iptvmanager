from flask import Blueprint, request, jsonify, send_file, render_template, redirect, url_for, flash
from flask_login import login_required
from app.modules.ingestion.services import IngestionService
from app.modules.ingestion.data_services import DataExportService, DataImportService
import io

ingestion_bp = Blueprint('ingestion', __name__)

# Ingestion APIs Only - HTML Routes Purged

@ingestion_bp.route('/export/excel', methods=['GET'])
@login_required
def export_excel():
    buffer = DataExportService.export_to_excel()
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
