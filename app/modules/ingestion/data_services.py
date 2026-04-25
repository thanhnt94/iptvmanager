import pandas as pd
from io import BytesIO
from app.modules.channels.models import Channel
from app.core.database import db

class DataExportService:
    @staticmethod
    def export_to_excel(user):
        """Exports all channels to an Excel file buffer."""
        channels = Channel.query.filter(db.or_(Channel.owner_id == user.id, Channel.is_public == True)).all()
        data = []
        for ch in channels:
            data.append({
                'ID': ch.id,
                'Name': ch.name,
                'Stream URL': ch.stream_url,
                'Logo URL': ch.logo_url,
                'Group': ch.group_name,
                'EPG ID': ch.epg_id,
                'Status': ch.status
            })
        
        df = pd.DataFrame(data)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Channels')
        output.seek(0)
        return output

class DataImportService:
    @staticmethod
    def import_from_excel(file_stream, visibility='private'):
        """Imports channels from an Excel file with deduplication."""
        df = pd.read_excel(file_stream)
        channels_data = []
        for _, row in df.iterrows():
            channels_data.append({
                'name': row.get('Name', 'Unknown'),
                'stream_url': row.get('Stream URL'),
                'logo_url': row.get('Logo URL'),
                'group_name': row.get('Group'),
                'epg_id': row.get('EPG ID')
            })
        
        from app.modules.ingestion.services import IngestionService
        return IngestionService.import_channels(channels_data, visibility=visibility)
