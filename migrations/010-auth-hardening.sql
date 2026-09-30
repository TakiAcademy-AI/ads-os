-- Migration 010: siết bảo mật đăng nhập.
--
-- Ba thiếu sót được vá ở đây:
--   1. Không có giới hạn số lần đăng nhập sai — dò mật khẩu thoải mái.
--   2. Không vô hiệu hoá được tài khoản (chỉ xoá hẳn, mất luôn liên kết dữ liệu).
--   3. Không biết ai đăng nhập lần cuối khi nào.

CREATE TABLE IF NOT EXISTS login_attempt (
  id         BIGSERIAL PRIMARY KEY,
  -- Lưu email đã nhập kể cả khi không tồn tại: kẻ dò thường thử nhiều email.
  email      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hai chỉ mục cho hai cách đếm: theo cặp (email, ip) và theo riêng ip.
CREATE INDEX IF NOT EXISTS login_attempt_pair_idx
  ON login_attempt (email, ip, created_at DESC) WHERE NOT ok;
CREATE INDEX IF NOT EXISTS login_attempt_ip_idx
  ON login_attempt (ip, created_at DESC) WHERE NOT ok;

COMMENT ON TABLE login_attempt IS
  'Nhật ký đăng nhập, dùng để chặn dò mật khẩu. Đếm theo CẶP (email, ip) chứ '
  'không chỉ theo email — khoá theo email thôi thì kẻ xấu chỉ cần nhập sai vài '
  'lần là khoá được tài khoản của người thật, biến cơ chế bảo vệ thành vũ khí.';

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS disabled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES app_user(id) ON DELETE SET NULL;

COMMENT ON COLUMN app_user.disabled_at IS
  'Khoá tài khoản mà KHÔNG xoá. Xoá hẳn sẽ kéo theo ad_account của người đó '
  '(ON DELETE CASCADE) — mất cả token lẫn lịch sử số liệu.';

-- Vai trò đã có từ migration 001 nhưng chưa từng được kiểm ở đâu trong code.
COMMENT ON COLUMN app_user.role IS
  'admin = quản lý người dùng + mọi thao tác; member = mọi thao tác trừ quản lý '
  'người dùng; viewer = CHỈ ĐỌC, mọi API ghi đều từ chối.';
