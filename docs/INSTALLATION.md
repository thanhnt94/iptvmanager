# Hướng dẫn cài đặt

Tài liệu này hướng dẫn cách thiết lập môi trường và cài đặt dự án IPTV Manager.

## 📋 Yêu cầu hệ thống

- **Python**: 3.10 trở lên.
- **FFmpeg**: Yêu cầu bắt buộc để sử dụng tính năng Health Check (ffprobe).
- **Hệ điều hành**: Windows, Linux (Ubuntu/Debian khuyên dùng), hoặc macOS.

---

## 🛠️ Bước 1: Cài đặt Python & Môi trường ảo

### Windows:
1.  Tải xuống Python từ [python.org](https://www.python.org/downloads/).
2.  Khởi tạo môi trường ảo:
    ```bash
    python -m venv venv
    .\venv\Scripts\activate
    ```

### Linux/macOS:
1.  Cài đặt Python 3:
    ```bash
    sudo apt update
    sudo apt install python3 python3-venv python3-pip
    ```
2.  Khởi tạo môi trường ảo:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

---

## 🛠️ Bước 2: Cài đặt FFmpeg (Quan trọng)

Health Check sử dụng `ffprobe` để phân tích các thông số luồng stream. Nếu không cài đặt FFmpeg, các tính năng này sẽ không hoạt động.

- **Windows**: Tải build từ [gyan.dev](https://www.gyan.dev/ffmpeg/builds/), giải nén và thêm thư mục `bin` vào biến môi trường `PATH`.
- **Linux (Ubuntu)**: `sudo apt install ffmpeg`
- **macOS**: `brew install ffmpeg`

Xác nhận cài đặt thành công bằng lệnh:
```bash
ffmpeg -version
ffprobe -version
```

---

## 🛠️ Bước 3: Cài đặt thư viện Python

Trong môi trường ảo đã kích hoạt, chạy lệnh sau:
```bash
pip install -r requirements.txt
```

Các thư viện quan trọng:
- `Flask`: Framework web chính.
- `SQLAlchemy`: ORM quản lý cơ sở dữ liệu.
- `m3u8`: Thư viện xử lý playlist M3U8 chuyên sâu.
- `pandas`: Xử lý dữ liệu lớn (nếu cần).

---

## 🛠️ Bước 4: Cấu hình biến môi trường

Tạo tệp `.env` tại thư mục gốc (hoặc chỉnh sửa `app/core/config.py`):

```ini
FLASK_APP=run.py
FLASK_ENV=development
SECRET_KEY=your_secret_key_here
DATABASE_URL=sqlite:///instance/iptv_manager.db
```

---

## 🛠️ Bước 5: Khởi tạo Database

Chạy lệnh sau để tạo các bảng dữ liệu:
```bash
python run.py
```
*(Hệ thống sẽ tự động tạo các bảng và tài khoản mặc định nếu chưa tồn tại)*

Mặc định, trang Dashboard sẽ hiển thị tại: `http://127.0.0.1:5000`
