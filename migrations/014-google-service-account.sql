-- Migration 014: kết nối Google Ads bằng service account.
--
-- Đăng nhập Google qua popup có thể bị Google chặn ở bước kiểm tra tài khoản
-- (bắt tạo passkey, rồi chờ tới 7 ngày) — app không can thiệp được bước đó.
-- Service account không cần ai đăng nhập: thêm email của nó làm người dùng
-- trong Google Ads là xong.
--
-- 'service_account' = encrypted_token giữ NGUYÊN file khoá JSON của service
-- account, không phải refresh token. Đăng nhập Google KHÔNG ghi đè loại này,
-- cùng lý do với token dán tay của Facebook.

ALTER TABLE ad_account DROP CONSTRAINT IF EXISTS ad_account_token_source_check;
ALTER TABLE ad_account ADD CONSTRAINT ad_account_token_source_check
  CHECK (token_source IN ('oauth', 'manual', 'service_account'));

COMMENT ON COLUMN ad_account.token_source IS
  'Nguồn của encrypted_token. manual = token Facebook dán tay; service_account = '
  'file khoá JSON service account Google. Hai loại này là token chính, đăng nhập '
  'không ghi đè. Ngắt tài khoản thì đặt lại về oauth.';
