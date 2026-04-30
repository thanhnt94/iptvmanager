# Hướng dẫn cài đặt

Tài liệu này hướng dẫn cách thiết lập môi trường và cài đặt dự án IPTV Manager.

## 📋 Yêu cầu hệ thống

- **Python**: 3.10 trở lên.
- **Node.js**: 18.x trở lên (để build frontend).
- **FFmpeg**: Yêu cầu bắt buộc để sử dụng tính năng Health Check (ffprobe).
- **Redis**: Yêu cầu bắt buộc làm Message Broker cho Celery.
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

## 🛠️ Bước 2: Cài đặt FFmpeg & Redis

### FFmpeg (Quan trọng)
Health Check sử dụng `ffprobe` để phân tích các thông số luồng stream.
- **Windows**: Tải build từ [gyan.dev](https://www.gyan.dev/ffmpeg/builds/), giải nén và thêm thư mục `bin` vào biến môi trường `PATH`.
- **Linux (Ubuntu)**: `sudo apt install ffmpeg`

### Redis (Bắt buộc cho Celery)
Hệ thống sử dụng Celery để quét kênh ngầm, yêu cầu Redis làm broker.
- **Windows**: Tải [Redis-x64-3.0.504.msi](https://github.com/microsoftarchive/redis/releases) hoặc sử dụng Docker.
- **Linux (Ubuntu)**: `sudo apt install redis-server`
- **Docker**: `docker run -d -p 6379:6379 redis`

---

## 🛠️ Bước 3: Cài đặt thư viện Python & Playwright

Trong môi trường ảo đã kích hoạt, chạy lệnh sau:
```bash
pip install -r requirements.txt
```

Cài đặt trình duyệt cho Playwright (dùng cho các luồng bypass nâng cao):
```bash
playwright install chromium
```

---

## 🛠️ Bước 4: Build Frontend (React)

Hệ thống sử dụng React SPA. Bạn có thể build bằng script Python tiện lợi:
```bash
python build_vite.py
```
Lệnh này sẽ tự động chạy `npm install` (nếu cần) và `npm run build` để tạo thư mục `app/static/dist`.

Nếu bạn muốn phát triển frontend và sử dụng Hot Reload, hãy dùng:
```bash
python run_vite.py
```

---

## 🛠️ Bước 5: Cấu hình biến môi trường

Tạo tệp `.env` tại thư mục gốc:

```ini
FLASK_APP=run_iptv.py
FLASK_ENV=development
SECRET_KEY=your_secret_key_here
DATABASE_URL=sqlite:///instance/iptv_manager.db
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

---

## 🛠️ Bước 6: Khởi chạy hệ thống

Hệ thống yêu cầu chạy song song hai tiến trình:

1. **Web Server**: Xử lý giao diện và API.
   ```bash
   python run_iptv.py
   ```

2. **Celery Worker**: Xử lý quét kênh và tác vụ ngầm.
   ```bash
   python run_celery.py
   ```

- **Dashboard**: `http://127.0.0.1:5030`
- **Tài khoản mặc định**: `admin` / `admin`


---

## ⚠️ Lưu ý cho Windows
Trên Windows, Celery worker được chạy ở chế độ `-P solo` thông qua script `run_iptv.py`. Nếu bạn muốn chạy thủ công, hãy sử dụng:
```bash
celery -A run_iptv.celery_worker worker --loglevel=info -P solo
```

