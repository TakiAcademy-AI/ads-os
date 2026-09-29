-- Migration 005: hỗ trợ yêu cầu xoá dữ liệu của Facebook.
--
-- Facebook bắt buộc app phải có endpoint nhận yêu cầu xoá dữ liệu người dùng.
-- Nhưng trước migration này Ads OS KHÔNG lưu Facebook user id ở đâu cả —
-- ad_account.owner_id trỏ tới app_user (tài khoản Ads OS), không phải tài khoản
-- Facebook đã cấp quyền. Nhận được yêu cầu xoá cũng không biết xoá gì.

ALTER TABLE ad_account
  ADD COLUMN IF NOT EXISTS fb_user_id TEXT;

CREATE INDEX IF NOT EXISTS ad_account_fb_user_idx ON ad_account (fb_user_id);

COMMENT ON COLUMN ad_account.fb_user_id IS
  'ID người dùng Facebook đã cấp quyền cho kết nối này. Ghi lúc OAuth callback. '
  'NULL với kết nối bằng token dán tay — không xác định được người cấp.';

DO $$ BEGIN
  CREATE TYPE deletion_status_t AS ENUM ('received', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS deletion_request (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mã tra cứu công khai. Người dùng dùng mã này để kiểm tra trạng thái.
  confirmation_code TEXT NOT NULL UNIQUE,
  fb_user_id        TEXT NOT NULL,
  status            deletion_status_t NOT NULL DEFAULT 'received',
  accounts_deleted  INT NOT NULL DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deletion_request_fb_user_idx ON deletion_request (fb_user_id);

COMMENT ON TABLE deletion_request IS
  'Nhật ký yêu cầu xoá dữ liệu từ Facebook. Giữ lại sau khi xoá để còn chứng '
  'minh đã xử lý — bản ghi này KHÔNG chứa dữ liệu quảng cáo, chỉ có id và mã tra cứu.';
