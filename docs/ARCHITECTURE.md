# Kiến trúc hệ thống

IPTV Manager được thiết kế theo kiến trúc Modular Monolith, giúp việc mở rộng và bảo trì dễ dàng hơn.

## 🏗️ Tổng quan cấu trúc thư mục

```text
iptvmanager/
├── app/
│   ├── core/           # Cấu hình hệ thống, DB, logging
│   ├── modules/        # Các module chức năng chính
│   │   ├── auth/       # Quản lý người dùng và bảo mật
│   │   ├── channels/   # Quản lý kênh stream (CRUD, Player)
│   │   ├── health/     # Dịch vụ Health Check (Tasks, Services)
│   │   ├── ingestion/  # Nhập dữ liệu từ M3U/M3U8
│   │   └── playlists/  # Quản lý Playlist đầu ra cho người dùng
│   └── templates/      # Giao diện HTML (Base & Shared)
├── instance/           # Cơ sở dữ liệu SQLite (mặc định)
├── logs/               # Nhật ký hệ thống
└── run.py              # Điểm khởi chạy ứng dụng
```

---

## 💾 Cơ sở dữ liệu (Database Schema)

Hệ thống sử dụng SQLAlchemy làm ORM. Các bảng chính bao gồm:

### 1. Channels (Bảng trung tâm)
Lưu trữ thông tin chi tiết về từng luồng stream:
- `name`, `stream_url`, `logo_url`, `group_name`.
- **Metadata**: `status` (live/die), `latency`, `resolution`, `audio_codec`.
- **Stats**: `play_count`, `total_watch_seconds`.

### 2. Playlists & Profiles
Quản lý các tập hợp kênh cho các thiết bị đầu cuối:
- `PlaylistProfile`: Chứa cấu hình bảo mật (security_token), IP cho phép.
- `PlaylistEntry`: Bảng trung gian liên kết giữa Profile và Channel (hỗ trợ sắp xếp thứ tự).
- `PlaylistGroup`: Định nghĩa các nhóm kênh (như Movies, Sports, News) trong playlist đầu ra.

### 3. Auth
- `User`: Quản lý tài khoản Admin/User và API Token cho việc gọi API hệ thống.

---

## ⚙️ Quy trình xử lý chính (Core Workflows)

### 1. Luồng nhập dữ liệu (Ingestion Workflow)
`Upload M3U8` -> `Regex/M3U8 Parser` -> `Deduplication (check stream_url)` -> `Save to DB`.

### 2. Luồng kiểm tra sức khỏe (Health Check Workflow)
Sử dụng `ffprobe` trong các tiến trình chạy ngầm (Background Task):
1.  Hệ thống quét từng URL trong cơ sở dữ liệu.
2.  Mở kết nối tạm thời để đo độ trễ (Latency).
3.  Trích xuất metadata (Resolution, Codec) nếu luồng hoạt động.
4.  Cập nhật trạng thái `Live/Die/Unknown`.

### 3. Luồng phân phối (Distribution Workflow)
Hệ thống tạo ra các URL duy nhất cho mỗi Playlist Profile:
`http://server/playlists/export/<slug>?token=<security_token>`
URL này có thể được nạp vào Smart TV, VLC hoặc các ứng dụng IPTV khác.

---

## 🛡️ Bảo mật (Security)

- **Playlist Token**: Mỗi playlist có một token bảo mật riêng biệt. Nếu bị lộ, có thể thu hồi/đổi token mà không ảnh hưởng đến playlist khác.
- **IP Whitelist**: Hỗ trợ giới hạn IP truy cập cho từng playlist cụ thể.
- **Role-based Access**: Admin có quyền quản lý toàn bộ hệ thống, User chỉ có quyền quản lý playlist của họ.
