from app import create_app
from app.core.database import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("Bắt đầu khởi tạo các Table mới (ChannelShare)...")
    db.create_all()
    print("Xong!")

    print("Bắt đầu Migrate bảng existing channels...")
    try:
        db.session.execute(text("ALTER TABLE channels ADD COLUMN owner_id INTEGER;"))
        print("Thêm cột owner_id thành công.")
    except Exception as e:
        print("Bỏ qua owner_id (có thể đã tồn tại):", e)
        
    try:
        db.session.execute(text("ALTER TABLE channels ADD COLUMN is_public BOOLEAN DEFAULT 1;"))
        print("Thêm cột is_public thành công.")
    except Exception as e:
        print("Bỏ qua is_public (có thể đã tồn tại):", e)

    try:
        db.session.execute(text("ALTER TABLE channels ADD COLUMN public_status VARCHAR(20) DEFAULT 'approved';"))
        print("Thêm cột public_status thành công.")
    except Exception as e:
        print("Bỏ qua public_status (có thể đã tồn tại):", e)

    # Đặt tất cả các kênh cũ về public để người dùng cũ không bị mất kênh
    print("Cập nhật tất cả kênh cũ thành Public...")
    db.session.execute(text("UPDATE channels SET is_public = 1, public_status = 'approved' WHERE is_public IS NULL;"))
    db.session.commit()
    print("Hoàn tất quy trình Migrate!")
