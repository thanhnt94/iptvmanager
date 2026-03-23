# Hướng dẫn tính năng

Tài liệu này giải thích chi tiết cách sử dụng các tính năng quan trọng nhất của IPTV Manager.

## 📥 1. Nhập dữ liệu (Ingestion)

Tính năng này giúp bạn nạp hàng loạt kênh từ các tệp `.m3u` hoặc `.m3u8` có sẵn.

- **Deduplication**: Hệ thống tự động kiểm tra `stream_url`. Nếu URL đã tồn tại, nó sẽ không được nạp lại để tránh rác dữ liệu.
- **Group Detection**: Tự động nhận diện thuộc tính `group-title` trong tệp M3U để phân loại kênh vào đúng nhóm.
- **Logo Sync**: Hỗ trợ nạp logo từ thuộc tính `tvg-logo`.

---

## 🔍 2. Kiểm tra sức khỏe (Health Check)

Hệ thống có một bộ máy quét ngầm (Background Scanner) cực kỳ mạnh mẽ:

- **Các chế độ quét**:
    - `Quét toàn bộ`: Quét lại tất cả các kênh trong hệ thống.
    - `Quét kênh cũ`: Chỉ quét các kênh chưa được kiểm tra trong vòng X ngày.
    - `Quét theo Playlist`: Chỉ quét các kênh thuộc một playlist cụ thể.
- **Thông số QoS**:
    - **Latency**: Đo thời gian kết nối đầu tiên.
    - **Quality**: Tự động đánh giá (Excellent < 500ms, Good < 1500ms, Poor > 1500ms).
- **Phân tích kỹ thuật (Technical Specs)**:
    - Nếu kênh "Live", hệ thống gọi `ffprobe` để lấy độ phân giải (1080p, 4K...) và codec âm thanh/video.
- **Điều khiển**: Bạn có thể "Bắt đầu" hoặc "Dừng" tiến trình quét bất cứ lúc nào thông qua Dashboard.

---

## 📺 3. Trình phát Video (HLS Player)

Hỗ trợ xem trực tiếp kênh ngay trên trình duyệt mà không cần cài đặt phần mềm bên ngoài:

- Sử dụng thư viện **HLS.js** cho hiệu suất cao.
- Hiển thị thông số kỹ thuật (Resolution, Codec) ngay bên cạnh trình phát.
- Tự động ghi lại lượt xem (`play_count`) để thống kê mức độ phổ biến của kênh.

---

## 📑 4. Quản lý Playlist đầu ra

Tính năng này giúp bạn tạo ra các danh sách kênh "sạch" và bảo mật để cung cấp cho người dùng hoặc thiết bị:

1.  **Tạo Profile**: Tạo một Profile mới (ví dụ: "Premium Movies").
2.  **Chọn kênh**: Thêm các kênh mong muốn từ cơ sở dữ liệu vào Profile.
3.  **Sắp xếp**: Kéo thả để thay đổi thứ tự kênh và phân nhóm lại (Custom Groups).
4.  **Security**: Cấu hình token bảo mật hoặc IP Whitelist cho Profile này.
5.  **Export**: Lấy link M3U8 duy nhất để nạp vào app IPTV.

---

## 📅 5. Quản lý EPG (Lịch phát sóng)

- **EPG Sources**: Quản lý các link XMLTV hoặc tệp EPG.
- **Mapping**: Tự động khớp `tvg-id` của kênh với dữ liệu trong EPG để hiển thị chương trình đang phát sóng.
- **Auto-Sync**: Tự động đồng bộ lịch phát sóng theo chu kỳ cài đặt sẵn.
