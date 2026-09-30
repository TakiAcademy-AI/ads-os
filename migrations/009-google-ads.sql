-- Migration 009: hỗ trợ Google Ads.
--
-- Hai khác biệt cốt lõi so với Facebook, và cả hai đều làm hỏng dữ liệu nếu
-- bỏ qua:
--
-- 1. CHUYỂN ĐỔI CỦA GOOGLE LÀ SỐ THẬP PHÂN.
--    Facebook trả số nguyên. Google trả `metrics.conversions` kiểu double —
--    một lượt chuyển đổi có thể tính 0.5 khi dùng mô hình phân bổ chia phần,
--    hoặc 3.7 khi một khách mua nhiều lần. Cột BIGINT sẽ cắt cụt phần thập
--    phân, và với tài khoản nhỏ thì 0.6 chuyển đổi bị làm tròn thành 0 — CPA
--    hoá vô cực, guard tưởng chiến dịch không đo được.
--
-- 2. GOOGLE DÙNG REFRESH TOKEN, KHÔNG PHẢI TOKEN DÀI HẠN.
--    Facebook cho token 60 ngày dùng thẳng. Google cho access token sống 1 giờ
--    kèm refresh token sống vĩnh viễn. Ta lưu REFRESH token vào encrypted_token
--    (dùng lại cột sẵn có) và đổi lấy access token mỗi lần gọi.

ALTER TABLE ad_metric_daily
  ALTER COLUMN conversions TYPE NUMERIC(14, 2) USING conversions::numeric;

COMMENT ON COLUMN ad_metric_daily.conversions IS
  'Số chuyển đổi. NUMERIC chứ không phải BIGINT vì Google Ads trả số thập phân '
  '(mô hình phân bổ chia phần). Làm tròn xuống số nguyên sẽ biến 0.6 thành 0 và '
  'khiến CPA hoá vô cực.';

-- Tài khoản Google nằm dưới một tài khoản quản lý (MCC). Mọi lời gọi API phải
-- kèm header login-customer-id là ID của MCC đó, nếu không Google từ chối với
-- lỗi quyền — mà thông báo lỗi không hề nhắc tới header còn thiếu.
ALTER TABLE ad_account
  ADD COLUMN IF NOT EXISTS login_customer_id TEXT;

COMMENT ON COLUMN ad_account.login_customer_id IS
  'ID tài khoản quản lý (MCC) của Google, chỉ chữ số. NULL nếu tài khoản đứng '
  'độc lập. Phải gửi kèm header login-customer-id ở MỌI lời gọi.';

COMMENT ON COLUMN ad_account.encrypted_token IS
  'Facebook: access token dài hạn (60 ngày), dùng thẳng. '
  'Google: REFRESH token (không hết hạn) — phải đổi lấy access token mỗi lần gọi.';

-- Google gọi "kênh quảng cáo" chứ không phải "mục tiêu". Giữ nguyên chuỗi gốc
-- vào objective_raw như đã làm với Facebook ở migration 004.
COMMENT ON COLUMN ad_campaign.objective_raw IS
  'Chuỗi gốc từ nền tảng trước khi ánh xạ: Facebook là objective (OUTCOME_*), '
  'Google là advertising_channel_type (SEARCH, DISPLAY, VIDEO...). Ánh xạ sai '
  'thì đây là cách duy nhất truy lại.';
