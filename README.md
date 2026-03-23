# IPTV Manager (M3U8)

Hệ thống quản lý Playlist IPTV toàn diện dựa trên Flask, hỗ trợ kiểm tra sức khỏe luồng (Health Check), phân tích kỹ thuật (FFmpeg/ffprobe) và trình phát video HLS tích hợp.

## 🚀 Tính năng chính

- **Quản lý Playlist**: Nhập/Xuất M3U8, quản lý nhóm (Groups) và sắp xếp kênh.
- **Health Check Thông minh**: Quét trạng thái Live/Die không đồng bộ, đo lường QoS (độ trễ, chất lượng).
- **Phân tích kỹ thuật**: Sử dụng `ffprobe` để lấy độ phân giải, codec âm thanh và video.
- **Trình phát HLS tích hợp**: Xem trước kênh trực tiếp trên trình duyệt bằng HLS.js.
- **Quản lý EPG**: Tích hợp nguồn EPG, tự động đồng bộ hóa lịch phát sóng.
- **Bảo mật**: Hệ thống User/Admin, mã thông báo API (API Token) cho từng Playlist.

## 📚 Tài liệu chi tiết

Vui lòng tham khảo bộ tài liệu chi tiết trong thư mục `/docs`:

1.  [**Hướng dẫn cài đặt**](docs/INSTALLATION.md) - Cài đặt Python, FFmpeg và các thư viện cần thiết.
2.  [**Kiến trúc hệ thống**](docs/ARCHITECTURE.md) - Chi tiết về Database, Module và Luồng dữ liệu.
3.  [**Hướng dẫn sử dụng & Tính năng**](docs/FEATURES.md) - Cách sử dụng Health Check, Ingestion và Player.
4.  [**Tài liệu API**](docs/API_REFERENCE.md) - Các endpoint để xuất Playlist cho Smart TV/Ứng dụng.

## 🛠️ Tech Stack

- **Backend**: Flask, SQLAlchemy, SQLite (hoặc PostgreSQL), APScheduler.
- **Công cụ**: FFmpeg/ffprobe (xử lý luồng stream).
- **Frontend**: Bootstrap 5, HLS.js, Chart.js.
- **Hàng đợi (Tùy chọn)**: Redis/Celery (cho các tác vụ quét lớn).

## ⚡ Bắt đầu nhanh

1. **Cài đặt dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Cài đặt FFmpeg**: (Bắt buộc để phân tích luồng).

3. **Khởi chạy ứng dụng**:
   ```bash
   python run.py
   ```

4. Truy cập: `http://127.0.0.1:5000`
