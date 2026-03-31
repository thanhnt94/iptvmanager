from flask import Blueprint, request, jsonify, send_file, render_template, redirect, url_for, flash
from app.modules.ingestion.services import IngestionService
from app.modules.ingestion.data_services import DataExportService, DataImportService
import io

ingestion_bp = Blueprint('ingestion', __name__)

@ingestion_bp.route('/import', methods=['GET', 'POST'])
def import_channels():
    if request.method == 'POST':
        result = None
        if 'm3u8_file' in request.files and request.files['m3u8_file'].filename:
            file = request.files['m3u8_file']
            content = file.read().decode('utf-8', errors='ignore')
            channels = IngestionService.parse_m3u8(content)
            result = IngestionService.import_channels(channels)
        
        elif 'm3u8_url' in request.form and request.form['m3u8_url']:
            url = request.form['m3u8_url']
            channels = IngestionService.parse_m3u8(url, is_url=True)
            result = IngestionService.import_channels(channels)
            
        if result:
            flash(f"Successfully imported {result['imported']} channels (skipped {result['skipped']} duplicates).")
            return redirect(url_for('channels.index'))
            
    return render_template('ingestion/import.html')

@ingestion_bp.route('/export/excel', methods=['GET'])
def export_excel():
    buffer = DataExportService.export_to_excel()
    return send_file(
        buffer,
        as_attachment=True,
        download_name='channels_export.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@ingestion_bp.route('/import/excel', methods=['POST'])
def import_excel():
    if 'excel_file' in request.files and request.files['excel_file'].filename:
        file = request.files['excel_file']
        result = DataImportService.import_from_excel(file)
        flash(f"Excel Import Success: {result['imported']} added, {result['skipped']} skipped.")
        return redirect(url_for('channels.index'))
    
    flash("No file selected for Excel import.")
    return redirect(url_for('ingestion.import_channels'))
