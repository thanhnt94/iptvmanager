# Tài liệu API & Export

Hệ thống cung cấp các endpoint để xuất Playlist và tích hợp với các ứng dụng bên thứ ba.

## 🔗 1. Xuất Playlist M3U8 (Public)

Đây là endpoint chính để nạp vào Smart TV, VLC, TiviMate hoặc các ứng dụng IPTV.

- **URL**: `/playlists/export/<slug>`
- **Method**: `GET`
- **Tham số (Query Params)**:
    - `token`: (Bắt buộc) Mã bảo mật của Playlist Profile.
- **Ví dụ**:
    ```text
    http://your-domain.com/playlists/export/premium-movies?token=abc123xyz
    ```

### Cấu trúc phản hồi:
Hệ thống trả về nội dung định dạng `#EXTM3U` tiêu chuẩn với đầy đủ metadata:
```text
#EXTM3U x-tvg-url="http://your-domain.com/epg.xml"
#EXTINF:-1 tvg-id="VTV1" tvg-logo="..." group-title="News",VTV1 HD
http://stream-url-here/playlist.m3u8
```

---

## 🔒 2. Quản lý IP Whitelist

Nếu Playlist Profile có cấu hình `allowed_ips`, hệ thống sẽ kiểm tra IP của yêu cầu:
- Nếu IP không nằm trong danh sách trắng -> Trả về lỗi `403 Forbidden`.
- Nếu danh sách IP trống -> Cho phép tất cả (nếu Token đúng).

---

## 📊 3. API Thống kê (Nội bộ)

Các endpoint này thường được sử dụng bởi Dashboard:

### Lấy trạng thái Health Check
- **URL**: `/health/status`
- **Method**: `GET`
- **Phản hồi**:
    ```json
    {
      "is_running": true,
      "total": 1500,
      "processed": 450,
      "live": 420,
      "die": 30,
      "percentage": 30.0
    }
    ```

### Dừng Health Check
- **URL**: `/health/stop`
- **Method**: `POST`
- **Phản hồi**: `{"status": "stop_requested"}`

---

## 📅 4. Xuất EPG (XMLTV)

- **URL**: `/channels/epg.xml`
- **Method**: `GET`
- **Mô tả**: Trả về dữ liệu lịch phát sóng tổng hợp từ tất cả các nguồn EPG đã được đồng bộ vào hệ thống theo định dạng XMLTV tiêu chuẩn.
