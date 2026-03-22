# IPTV Playlist Manager (M3U8)

A robust IPTV Playlist Manager built with Flask, featuring health checks, technical stream analysis (FFmpeg/ffprobe), and an integrated HLS video player.

## Features

- **M3U/M3U8 Parsing**: Robust manual parsing using regex to handle various IPTV metadata formats (tvg-id, logo, group-title).
- **Background Health Check**: Asynchronous scanning of large playlists with status tracking (Live/Die).
- **QoS Monitoring**: Measures stream latency and assigns quality ratings (Excellent, Good, Poor).
- **Technical Inspection**: Uses `ffprobe` to extract resolution and audio codec information from live streams.
- **Embedded Player**: Integrated HLS.js player for instant channel preview within the dashboard.
- **Progressive UI**: Real-time progress percentage and "Stop" control for long-running scans.
- **Deduplication**: Automatically prevents duplicate channels during import based on stream URL.

## Prerequisites

- Python 3.10+
- FFmpeg (for technical specs/ffprobe)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/iptv-manager.git
   cd iptv-manager
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:
   ```bash
   python run.py
   ```

4. Access at `http://127.0.0.1:5000`

## Tech Stack

- **Backend**: Flask, SQLAlchemy, SQLite, APScheduler
- **Tools**: FFmpeg/ffprobe (subprocess integration)
- **Frontend**: Bootstrap 5, HLS.js
