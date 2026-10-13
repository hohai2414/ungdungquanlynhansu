# UEH Core HR — MVP quản lý nhân sự

Giao diện áp dụng brand guideline DESIGN.md: UEH Navy #005F69, cam #F26F33, font Inter, thẻ bo góc 8px, nút và ô nhập 4px, bảng có tiêu đề viết hoa và nhãn trạng thái chuẩn hóa. CSS được nhúng trong `index.html`. Đã kiểm tra trực tiếp dashboard ở desktop 1440px, tablet 1024px và điện thoại 390px; tablet dùng menu biểu tượng, điện thoại dùng menu ngang và thẻ xếp dọc. Dấu chữ UEH Core HR là nhận diện bằng văn bản, không phải tệp logo chính thức.

## Khởi chạy

Cần Node.js 24.x. Cài dependency bằng `npm ci` trước lần chạy đầu.

```powershell
cd 'C:\Users\Dell\Downloads\tạo ứng dụng'
npm ci
npm start
```

Mở http://localhost:3000. Chạy kiểm tra bằng `npm test`. Nếu deploy Vercel, làm theo [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) để cấu hình database từ xa và mật khẩu tài khoản mẫu.

Tài khoản minh họa, cùng mật khẩu **Demo@123**:

| Vai trò | Email |
| --- | --- |
| HR | user1@demo.vn |
| Điều phối | user2@demo.vn |
| Nhân viên | user3@demo.vn |
| Cộng tác viên | user21@demo.vn |

Lần chạy đầu tạo 20 nhân viên, 8 cộng tác viên, ca làm, công thiếu check-out, kết quả chờ duyệt và yêu cầu nghỉ. Đây là dữ liệu minh họa, không chứa thông tin nhân sự thật.

## Cấu trúc

`server.js`: HTTP API, đăng nhập, kiểm tra quyền và dữ liệu mẫu. `database.js`: SQLite cục bộ hoặc libSQL từ xa, giao dịch có rollback. `api/index.js` và `vercel.json`: entrypoint và routing Vercel. `index.html`: giao diện đáp ứng tiếng Việt. Các tệp `*.test.js` và `test.js`: kiểm tra nghiệp vụ và triển khai. `hr.sqlite`: database thật tạo khi chạy cục bộ, không xóa nếu cần giữ lịch sử.

Database chứa hồ sơ và tài khoản, ca làm, người tham gia với đơn giá lịch sử, lượt chấm công, yêu cầu, kết quả bàn giao, cấu hình, nhật ký và phiên đăng nhập. Mỗi thay đổi API thực hiện trong giao dịch; mật khẩu dùng scrypt và cookie phiên HttpOnly (Secure trên Vercel). Phiên hết hạn sau 8 giờ và được giữ qua cold start. Token phiên chỉ lưu bản băm trong database. Nhân viên/CTV chỉ đọc dữ liệu của mình; HR và điều phối đọc dữ liệu bộ phận. Chỉ HR sửa hồ sơ, cấu hình và thanh toán.

## Đã thực hiện

- Đăng nhập, đăng xuất, lưu dữ liệu bền vững; lọc dữ liệu và quyền thao tác tại máy chủ.
- Hồ sơ và ngừng hoạt động, khu vực, kỹ năng, lịch rảnh, đơn giá giờ/ca/ngày.
- Lịch ngày/tuần/tháng; tạo ca với phụ trách và phối hợp, chặn trùng ca và nghỉ đã duyệt, cảnh báo thiếu người, nhận/từ chối và hủy ca.
- Check-in/out theo ca, ảnh tối đa 1,5 MB, vị trí chỉ lấy khi nhấn đồng ý; giải trình khi định vị không khả dụng. Cảnh báo thiếu check-out, muộn, chưa chấm công và quá hạn.
- Bàn giao và duyệt/từ chối kết quả riêng; duyệt số giờ riêng, điều chỉnh thiếu check-out qua yêu cầu và lưu nhật ký.
- Yêu cầu nghỉ cả/nửa ngày, lịch rảnh/bận, xin hủy ca; quản lý duyệt/từ chối.
- Báo cáo lọc tháng/nhân sự/dự án, tiền theo công đã duyệt và đơn giá lưu lúc phân ca, ba trạng thái thanh toán, CSV UTF-8 dùng với Excel.

## Giới hạn cần biết

- Có cấu hình Vercel với database Turso/libSQL từ xa; cần thiết lập URL, token và mật khẩu mẫu trước khi dùng. Không dùng SQLite cục bộ hay `/tmp` để lưu dữ liệu trên Vercel. Máy chủ local chỉ lắng nghe localhost. Trước khi dùng thật cần giới hạn thử đăng nhập, sao lưu và triển khai có giám sát.
- Không có gửi email, thông báo đẩy, đặt lại mật khẩu hoặc quản lý phiên nhiều máy. Tài khoản mẫu cần thay trước sử dụng thật.
- Lịch thể hiện ca, chưa có bảng trạng thái văn phòng/từ xa/nghỉ cho từng nhân sự từng ngày. Văn phòng trên tổng quan dựa theo check-in; hiện trường dựa trên phân công, chưa phải xác nhận có mặt.
- Lịch rảnh/bận lưu dưới hồ sơ và yêu cầu; chưa tự chặn phân công theo lịch bận. Chưa sửa ca đã tạo; có thể hủy và tạo lại.
- Nghỉ nửa ngày ghi số lượng 0,5 nhưng chưa chọn buổi sáng/chiều; hiện chặn phân công cả ngày nghỉ đã duyệt.
- Giờ thực tế trừ toàn bộ phút nghỉ cấu hình mỗi lượt, chưa tính chính xác khoảng nghỉ chồng lấn hay ca qua đêm. Ca được thanh toán trọn đơn giá khi có giờ duyệt > 0; chưa tự gộp nhiều lượt công trong một ca. Nên dùng một lượt cho mỗi ca.
- Thay đổi cấu hình giờ/ngày tác động cách quy đổi báo cáo; đơn giá lịch sử được giữ nhưng quy tắc quy đổi chưa có phiên bản lịch sử.
- Ảnh lưu dạng dữ liệu trong SQLite; phù hợp bộ phận nhỏ, chưa có kho tệp riêng. Không có xuất XLSX, chỉ CSV; không tính lương/thuế/bảo hiểm.
- Giao diện được kiểm tra cú pháp và API, chưa kiểm thử bằng trình duyệt tự động. Phông chữ Google có phương án dự phòng Arial khi ngoại tuyến.

## Sao lưu

Dừng máy chủ trước khi sao chép `hr.sqlite` sang vị trí an toàn. Không chia sẻ database vì chứa tài khoản, ảnh và dữ liệu công. Bộ test dùng database riêng trong thư mục tạm, không thay đổi dữ liệu ứng dụng.
