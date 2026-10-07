-- Migration 016: kết nối TikTok qua TikTok for Business MCP Server.
--
-- MCP Server KHÔNG cần app nhà phát triển (không đăng ký, không chờ duyệt):
-- Ads OS tự đăng ký client (Dynamic Client Registration) + PKCE. Đổi lại:
-- access token sống 24 giờ, refresh token 30 ngày và KHÔNG gia hạn — hết 30
-- ngày người dùng phải cấp quyền lại.
--
-- 'mcp' = encrypted_token giữ JSON {access_token, refresh_token, hạn…} của MCP.

ALTER TABLE ad_account DROP CONSTRAINT IF EXISTS ad_account_token_source_check;
ALTER TABLE ad_account ADD CONSTRAINT ad_account_token_source_check
  CHECK (token_source IN ('oauth', 'manual', 'service_account', 'mcp'));

-- Hạn của QUYỀN (không phải của access token). Dùng để cảnh báo trước ở trang
-- Kết nối — hết hạn mà không ai báo là đồng bộ và tắt ads tự động ngừng câm.
ALTER TABLE ad_account ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN ad_account.token_expires_at IS
  'Thời điểm kết nối hết hiệu lực và phải cấp quyền lại (TikTok MCP: 30 ngày). NULL = không hết hạn hoặc chưa biết.';
