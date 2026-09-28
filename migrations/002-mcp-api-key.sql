-- Migration 002: API key cho MCP server.
--
-- Key KHÔNG lưu dạng thô. Chỉ lưu SHA-256 — lộ database thì cũng không dùng
-- được key. Người dùng thấy key đúng một lần lúc tạo, sau đó chỉ còn 4 ký tự
-- cuối để nhận diện.
--
-- Không dùng bcrypt ở đây: key do hệ thống sinh, 32 byte ngẫu nhiên, không
-- brute-force được như mật khẩu người đặt. Bcrypt chỉ làm mỗi request MCP
-- chậm thêm ~100ms vô ích.

DO $$ BEGIN
  CREATE TYPE api_key_status_t AS ENUM ('active', 'paused', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS api_key (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- SHA-256 hex của key thô
  key_hash     TEXT NOT NULL UNIQUE,
  -- 4 ký tự cuối, để người dùng nhận ra key nào là key nào
  key_suffix   TEXT NOT NULL,
  -- Mặc định CHỈ ĐỌC. Tool ghi phải cấp scope 'write' một cách có ý thức.
  scopes       TEXT[] NOT NULL DEFAULT ARRAY['read'],
  status       api_key_status_t NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_key_owner_idx ON api_key (owner_id, created_at DESC);

COMMENT ON TABLE api_key IS
  'Key cho MCP server. Chỉ lưu hash. Thu hồi bằng status=revoked, không xoá — '
  'để nhật ký còn truy được key nào đã làm gì.';

-- Nhật ký request MCP, để trang MCP hiện realtime và để truy vết khi có sự cố.
CREATE TABLE IF NOT EXISTS mcp_request_log (
  id          BIGSERIAL PRIMARY KEY,
  api_key_id  UUID REFERENCES api_key(id) ON DELETE SET NULL,
  tool        TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  duration_ms INT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mcp_request_log_time_idx ON mcp_request_log (created_at DESC);
