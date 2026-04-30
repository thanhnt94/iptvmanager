# IPTV Manager (Modular Monolith)

Hệ thống quản lý Playlist IPTV toàn diện dựa trên Flask & React, hỗ trợ kiểm tra sức khỏe luồng (Health Check) không đồng bộ qua Celery, phân tích kỹ thuật (FFmpeg/ffprobe) và trình phát video HLS hiện đại.

## 🚀 Tính năng chính

- **Kiến trúc Modular Monolith**: Dễ dàng bảo trì và mở rộng với các module độc lập.
- **Quản lý Playlist Thông minh**: Tự động tạo playlist theo người dùng, hỗ trợ Dynamic Routes (Friendly URLs).
- **Health Check Không đồng bộ**: Sử dụng Celery & Redis để quét trạng thái Live/Die hàng loạt mà không làm treo hệ thống.
- **Phân tích kỹ thuật chuyên sâu**: Trích xuất codec, độ phân giải, bitrate bằng `ffprobe`.
- **Trình phát HLS hiện đại**: Tích hợp React Player với khả năng chọn chất lượng và theo dõi phiên xem.
- **Quản lý EPG & Sync**: Tự động đồng bộ và map dữ liệu EPG cho từng kênh.
- **Bảo mật & SSO**: Hệ thống Auth Center tích hợp, quản lý Token và IP Whitelist cho từng Playlist.

## 📚 Tài liệu chi tiết

Vui lòng tham khảo bộ tài liệu chi tiết trong thư mục `/docs`:

1.  [**Hướng dẫn cài đặt**](docs/INSTALLATION.md) - Cài đặt Python, FFmpeg, Redis và Frontend build.
2.  [**Kiến trúc hệ thống**](docs/ARCHITECTURE.md) - Chi tiết về Modular Monolith, Celery Worker và SPA/SSR Hybrid.
3.  [**Hướng dẫn sử dụng & Tính năng**](docs/FEATURES.md) - Cách sử dụng Health Check, Ingestion và các chế độ Streaming.
4.  [**Tài liệu API**](docs/API_REFERENCE.md) - Các endpoint Friendly URL và API nội bộ cho Dashboard.

## 🛠️ Tech Stack

- **Backend**: Flask (Python 3.10+), SQLAlchemy, Celery, Redis.
- **Frontend**: React, TypeScript, Vite, TailwindCSS (trong `iptv-studio`).
- **Công cụ**: FFmpeg/ffprobe, Playwright (cho scanning nâng cao).
- **Cơ sở dữ liệu**: SQLite (mặc định) hoặc PostgreSQL.

## ⚡ Bắt đầu nhanh

1. **Cài đặt dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Cài đặt Redis**: (Bắt buộc cho Celery).

3. **Build Frontend**:
   ```bash
   python build_vite.py
   ```

4. **Khởi chạy hệ thống**:
   Mở các terminal riêng biệt:
   
   - **Terminal 1 (Web Server)**:
     ```bash
     python run_iptv.py
     ```
   - **Terminal 2 (Celery Worker)**:
     ```bash
     python run_celery.py
     ```
   - **Terminal 3 (Vite Dev - Tùy chọn)**:
     ```bash
     python run_vite.py
     ```

5. Truy cập: `http://127.0.0.1:5030`


