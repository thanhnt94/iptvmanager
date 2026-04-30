# Kiến trúc hệ thống

IPTV Manager được thiết kế theo kiến trúc **Modular Monolith (Hexagonal Style)** kết hợp với mô hình **Hybrid SPA/SSR**.

## 🏗️ Tổng quan cấu trúc thư mục

```text
iptvmanager/
├── app/
│   ├── core/           # Cấu hình hệ thống, DB, logging, Celery config
│   ├── modules/        # Các module chức năng (Hexagonal Style)
│   │   ├── auth/       # Quản lý người dùng (Session-based)
│   │   ├── auth_center/# SSO & API Token management
│   │   ├── channels/   # Quản lý kênh stream (CRUD, Player, EPG)
│   │   ├── health/     # Dịch vụ Health Check (Tasks, Services)
│   │   ├── ingestion/  # Nhập dữ liệu từ M3U/M3U8
│   │   ├── playlists/  # Quản lý Playlist đầu ra & Friendly URLs
│   │   ├── settings/   # Quản lý cấu hình hệ thống (FFmpeg path, v.v.)
│   │   └── streams/    # Xử lý logic chuyển hướng & tracking luồng
│   ├── static/dist/    # Chứa bản build của React SPA
│   └── templates/      # Base template cho SSR (phục vụ SPA index)
├── iptv-studio/        # Mã nguồn Frontend (React + Vite + TS)
├── instance/           # Cơ sở dữ liệu SQLite
├── logs/               # Nhật ký hệ thống
├── run_iptv.py         # Entry point Web Server (Flask)
└── run_celery.py       # Entry point Background Worker (Celery)
```

---

## 💻 Mô hình SPA/SSR Hybrid

Hệ thống sử dụng Flask làm backend API và phục vụ trang Single Page Application (SPA):
1.  **Backend (Flask)**: Cung cấp RESTful API tại `/api/*`. Các luồng Export M3U8 được phục vụ trực tiếp qua SSR để đảm bảo tốc độ và tính tương thích.
2.  **Frontend (React)**: Xử lý toàn bộ giao diện Dashboard, Player, và quản lý Channel/Playlist. Bản build sản phẩm được Flask phục vụ từ `app/static/dist`.
3.  **Routing**: Flask xử lý các route API và route tĩnh. Các route giao diện khác được điều hướng về `index.html` để React Router xử lý.

---

## ⚙️ Background Processing (Celery & Redis)

Để tránh gây nghẽn (blocking) cho người dùng khi kiểm tra hàng nghìn kênh, hệ thống sử dụng Celery:
- **Broker**: Redis được sử dụng để quản lý hàng đợi tác vụ.
- **Worker**: Một process riêng biệt chạy `ffprobe` để phân tích luồng.
- **Tasks**: 
    - `scan_channels`: Quét trạng thái Live/Die.
    - `sync_epg`: Đồng bộ lịch phát sóng từ nguồn XMLTV.
    - `auto_cleanup`: Dọn dẹp các session hoặc log cũ.

---

## 💾 Cơ sở dữ liệu (Database Schema)

Hệ thống sử dụng SQLAlchemy với các bảng chính:

### 1. Channels
- `name`, `stream_url`, `logo_url`, `group_name`, `is_passthrough`.
- **Metadata**: `status`, `latency`, `resolution`, `stream_format`.
- **Ownership**: `owner_id` (kênh cá nhân) hoặc `is_public` (kênh hệ thống).

### 2. Playlists & Profiles
- `PlaylistProfile`: Định nghĩa một playlist (slug, security_token).
- `PlaylistEntry`: Liên kết kênh vào playlist với thứ tự (`order_index`) và nhóm tùy chỉnh (`custom_group`).
- **Dynamic Playlists**: Hệ thống tự động tạo các playlist `all` và `protected` cho mỗi người dùng.

### 3. Auth & Settings
- `User`: Quản lý tài khoản, `api_token` cho streaming.
- `Setting`: Lưu trữ cấu hình động (FFMPEG_PATH, SCAN_TIMEOUT).

---

## 🛡️ Bảo mật (Security)

- **Session Security**: Sử dụng `flask-session` lưu trữ trong database.
- **Streaming Auth**: Mỗi request stream yêu cầu `api_token` hợp lệ hoặc thông qua Friendly URL đã được cấu hình bảo mật.
- **IP Whitelisting**: Cho phép giới hạn thiết bị truy cập cho từng Playlist Profile.

