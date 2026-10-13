# Triển khai UEH Core HR trên Vercel

Ứng dụng dùng một Vercel Node.js Function và database libSQL từ xa (Turso). Không lưu SQLite trong `/tmp`: dữ liệu ở đó không bền vững. Trang đăng nhập được phục vụ tĩnh, API nằm dưới `/api/*`.

## 1. Tạo database

1. Đăng nhập https://turso.tech và tạo một database **libSQL / tương thích SQLite** cho ứng dụng. Chọn vùng gần Singapore nếu tài khoản hỗ trợ.
2. Trong database dashboard, lấy **Database URL** (dạng `libsql://...turso.io`) và tạo **Auth Token** có quyền đọc/ghi.
3. Giữ token trong Vercel Environment Variables. Không dán token vào chat, commit GitHub hoặc mã frontend.

Nếu dùng Turso CLI, tài liệu: https://docs.turso.tech/cli/introduction. Tạo database và lấy URL/token bằng các lệnh của CLI; không đưa token vào README hoặc ảnh chụp.

## 2. Cấu hình Vercel

Mở project `ungdungquanlynhansu` → **Settings → Environment Variables**, thêm cho môi trường **Production** (và Preview nếu cần):

| Biến | Giá trị |
| --- | --- |
| `TURSO_DATABASE_URL` | URL database lấy ở bước 1 |
| `TURSO_AUTH_TOKEN` | Token đọc/ghi của database |
| `DEMO_PASSWORD` | Mật khẩu tối thiểu 5 ký tự cho các tài khoản mẫu; `12345` chỉ dùng thử nghiệm |

Trong **Build and Deployment**:

- Root Directory: thư mục gốc repository.
- Framework Preset: **Other**.
- Node.js Version: **24.x** (package.json đã khai báo).
- Không đặt Output Directory tùy chỉnh; xóa override cũ nếu có. Không dùng `npm start` làm Build Command.
- Repository đã có `vercel.json` chỉ định rõ trang tĩnh và Function; Vercel tự cài dependency từ package-lock.json.

Sau khi lưu biến môi trường: **Deployments → deployment mới nhất → Redeploy**. Nếu GitHub integration hoạt động, commit sửa sẽ tự tạo deployment; sau khi thêm biến môi trường vẫn cần Redeploy.

## 3. Kiểm tra

1. Mở trang chủ: phải thấy trang đăng nhập, không còn `FUNCTION_INVOCATION_FAILED`.
2. Mở `/api/health`: phải trả `{"ok":true,"storage":"remote"}`. API này khởi tạo cấu trúc database và dữ liệu mẫu nếu database trống.
3. Đăng nhập `user1@demo.vn` bằng giá trị `DEMO_PASSWORD` vừa đặt. Quản lý: `user2@demo.vn`, nhân viên: `user3@demo.vn`, CTV: `user21@demo.vn`.
4. Tạo một yêu cầu, tải lại trang và kiểm tra dữ liệu còn; đăng nhập lại sau redeploy để kiểm tra database lưu bền vững. Phiên được lưu trong database, cookie Secure/HttpOnly và hết hạn sau 8 giờ.

Nếu thiếu URL/token, API trả **503** có hướng dẫn thay vì làm Function chết khi khởi động. Nếu token sai/không truy cập được, kiểm tra Function Logs và các biến môi trường rồi Redeploy. Không dùng database dùng một lần để lưu nhân sự thật.

`DEMO_PASSWORD` chỉ dùng khi tạo dữ liệu mẫu trên database **trống**. Đổi biến này sau đó không đổi mật khẩu tài khoản đã tồn tại. Tài khoản mẫu cùng mật khẩu chỉ dành cho trải nghiệm; trước khi dùng dữ liệu thật, tạo tài khoản riêng và ngừng hoạt động tài khoản mẫu.

## Chạy cục bộ

```powershell
npm ci
npm start
```

Khi không có biến Turso và không chạy trên Vercel, ứng dụng tiếp tục dùng `hr.sqlite` hiện có, giữ nguyên dữ liệu. Không cần đưa database này lên GitHub. Có thể chạy với biến Turso để kiểm tra remote, nhưng chọn một database thử nghiệm riêng.

## Phạm vi kiểm chứng

Các kiểm tra tự động xác minh nghiệp vụ, adapter database từ xa và rollback, cold start không ghi vào thư mục triển khai, thông báo thiếu cấu hình và phiên tồn tại qua tiến trình máy chủ mới. Chưa kiểm chứng kết nối Turso thật hoặc deployment production khi chưa có URL/token database.
