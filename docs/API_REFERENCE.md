# Tài liệu API & Export

Hệ thống cung cấp các endpoint linh hoạt để xuất Playlist và tích hợp với các ứng dụng bên thứ ba (Smart TV, VLC, TiviMate).

## 🔗 1. Friendly URL (Khuyên dùng)

Đây là cách dễ nhất để nạp playlist vào thiết bị. Cấu trúc URL cực kỳ đơn giản:

- **Cấu trúc**: `http://<domain>/<username>/<slug>`
- **Ví dụ**: `http://iptv.local/admin/all` (Tất cả kênh của admin)
- **Ví dụ**: `http://iptv.local/admin/protected` (Chỉ các kênh gốc của admin)

### Tham số tùy chọn (Query Params hoặc Path)
Bạn có thể tùy chỉnh playlist bằng cách thêm các tham số vào sau slug:
- **Mode**: `direct`, `smart`, `tracking`.
- **Status**: `live` (chỉ lấy kênh Live), `all` (lấy tất cả).

**Ví dụ nâng cao**:
- `http://iptv.local/p/admin/movies/direct/live`: Playlist "movies" của admin, dùng link trực tiếp, chỉ lấy kênh Live.

---

## 📅 2. Xuất EPG (XMLTV)

Để hiển thị lịch phát sóng, hãy sử dụng endpoint EPG tương ứng với playlist:

- **URL**: `http://<domain>/<username>/<slug>.xml`
- **Ví dụ**: `http://iptv.local/admin/all.xml`

---

## 📊 3. API Hệ thống (Dành cho Dashboard/SPA)

Tất cả các API nội bộ hiện được đặt dưới tiền tố `/api/`.

### Thống kê Dashboard
- **URL**: `/api/dashboard/stats`
- **Method**: `GET`
- **Phản hồi**: Trả về tổng số kênh, số kênh Live/Die, số người đang xem, và trạng thái server.

### Quản lý Health Check
- **URL**: `/api/health/status` - Lấy trạng thái quét hiện tại.
- **URL**: `/api/playlists/<id>/quick-check` - Bắt đầu quét nhanh cho một playlist.

### Quản lý Kênh & Playlist
- **URL**: `/api/channels` - Danh sách kênh (hỗ trợ phân trang, tìm kiếm).
- **URL**: `/api/playlists` - Danh sách các Playlist Profile.

---

## 🔒 4. Bảo mật & Authentication

### API Token
Mỗi người dùng có một `api_token` duy nhất. Token này được sử dụng trong các link stream nội bộ (`/api/streams/play/...`).

### Playlist Token
Các playlist tùy chỉnh có thể yêu cầu một `token` bảo mật riêng:
- `http://<domain>/p/admin/my-list?token=abc123xyz`

### IP Whitelist
Nếu Playlist Profile cấu hình IP Whitelist, chỉ các địa chỉ IP được phép mới có thể truy cập playlist và các luồng stream bên trong.

