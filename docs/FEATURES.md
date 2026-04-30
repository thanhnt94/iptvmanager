# Hướng dẫn tính năng

Tài liệu này giải thích chi tiết cách sử dụng các tính năng quan trọng nhất của IPTV Manager.

## 📥 1. Nhập dữ liệu (Ingestion)

Tính năng này giúp bạn nạp hàng loạt kênh từ các tệp `.m3u` hoặc `.m3u8` có sẵn.

- **Deduplication**: Hệ thống tự động kiểm tra `stream_url`. Nếu URL đã tồn tại, nó sẽ không được nạp lại để tránh rác dữ liệu.
- **Group Detection**: Tự động nhận diện thuộc tính `group-title` để phân loại kênh.
- **Multi-source Mapping**: Hỗ trợ map kênh vào các playlist hiện có ngay trong quá trình nhập.

---

## 🔍 2. Kiểm tra sức khỏe (Health Check)

Hệ thống sử dụng Celery Worker để quét kênh không đồng bộ:

- **QoS Metrics**: Latency (độ trễ), Quality (Excellent/Good/Poor).
- **Technical Analysis**: Tự động gọi `ffprobe` để lấy thông số `Resolution`, `Video Codec`, `Audio Codec`.
- **Auto-Scanning**: Mỗi Playlist có thể cấu hình thời gian tự động quét (ví dụ: quét mỗi 24h).
- **Status Dashboard**: Theo dõi tiến trình quét theo thời gian thực.

---

## 📺 3. Trình phát Video (Modern Player)

Trình phát tích hợp trong `iptv-studio` cung cấp trải nghiệm hiện đại:

- **HLS & TS Support**: Chơi mượt mà các luồng HLS và hỗ trợ chuyển đổi TS.
- **Quality Selector**: Chọn độ phân giải (nếu luồng cung cấp đa chất lượng).
- **Session Tracking**: Theo dõi số lượng người đang xem cùng một lúc.
- **PiP (Picture-in-Picture)**: Xem video trong khi vẫn thao tác trên Dashboard.

---

## 📑 4. Quản lý Playlist & Friendly URLs

Hệ thống cho phép tạo các danh sách kênh linh hoạt:

- **Personalized Playlists**: Mỗi người dùng tự động có playlist `all` (tất cả kênh họ có quyền xem) và `protected` (chỉ các kênh gốc).
- **Friendly URLs**: Xuất playlist qua link ngắn gọn: `/<username>/all` hoặc `/p/<username>/my-playlist`.
- **Reordering**: Kéo thả để sắp xếp thứ tự kênh trực quan.
- **Custom Grouping**: Thay đổi nhóm của kênh chỉ trong phạm vi playlist đó mà không ảnh hưởng đến dữ liệu gốc.

---

## 🔗 5. Chế độ Streaming (Streaming Modes)

Khi xuất playlist, bạn có thể chọn chế độ streaming phù hợp:

- **Smart (Mặc định)**: Tự động chọn giữa Direct và Proxy tùy theo loại luồng.
- **Direct**: Trả về URL gốc của luồng (giảm tải cho server).
- **Tracking**: Chuyển hướng qua server để theo dõi lượt xem và trạng thái.

---

## 📅 6. Quản lý EPG (Lịch phát sóng)

- **EPG Sync**: Tự động tải dữ liệu XMLTV từ các nguồn cấu hình sẵn.
- **Intelligent Mapping**: Khớp `tvg-id` một cách thông minh, hỗ trợ sửa thủ công nếu không khớp tự động.
- **Integrated View**: Xem lịch phát sóng ngay bên cạnh trình phát video.

