-- Migration 013: token dán tay là token CHÍNH.
--
-- Trước migration này mọi đường lưu token đều ghi đè lẫn nhau: dán token tay
-- xong, bấm "Đăng nhập bằng Facebook" lại một lần là token tay mất mà không ai
-- biết. Người dùng dán token tay chính là vì token đăng nhập không dùng được
-- (thiếu quyền, sai người, bị chốt bảo mật) — để nó bị đè là phá đúng lựa chọn
-- họ vừa làm.
--
-- 'manual' = token dán tay. Đăng nhập Facebook KHÔNG ghi đè token loại này.
-- Muốn quay về token đăng nhập: Ngắt tài khoản (đặt lại về 'oauth') rồi đăng
-- nhập lại.

ALTER TABLE ad_account
  ADD COLUMN IF NOT EXISTS token_source TEXT NOT NULL DEFAULT 'oauth'
    CHECK (token_source IN ('oauth', 'manual'));

COMMENT ON COLUMN ad_account.token_source IS
  'Nguồn của encrypted_token. manual = dán tay, là token chính: đăng nhập '
  'Facebook không ghi đè. Ngắt tài khoản thì đặt lại về oauth.';
