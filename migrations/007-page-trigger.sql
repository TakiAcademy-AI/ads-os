-- Migration 007: Page Facebook và nhật ký bài viết đã kích hoạt quảng cáo.

DO $$ BEGIN
  ALTER TYPE ad_mutation_op_t ADD VALUE IF NOT EXISTS 'campaign_create';
EXCEPTION WHEN others THEN NULL; END $$;

-- Bài viết đọc bằng PAGE token, không phải user token. Mỗi Page một token riêng.
CREATE TABLE IF NOT EXISTS fb_page (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  page_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  encrypted_token BYTEA,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, page_id)
);

CREATE INDEX IF NOT EXISTS fb_page_owner_idx ON fb_page (owner_id, name);

-- Bài nào đã kích hoạt rồi thì không làm lại. Không có bảng này, mỗi lượt cron
-- sẽ tạo thêm một chiến dịch cho cùng một bài viết.
CREATE TABLE IF NOT EXISTS triggered_post (
  id                   BIGSERIAL PRIMARY KEY,
  config_id            UUID NOT NULL REFERENCES automation_config(id) ON DELETE CASCADE,
  post_id              TEXT NOT NULL,
  campaign_external_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (config_id, post_id)
);

COMMENT ON TABLE triggered_post IS
  'Bài viết đã sinh chiến dịch. Khoá theo (cấu hình, bài) chứ không chỉ theo bài — '
  'hai cấu hình khác nhau có thể cố ý cùng nhắm một bài.';
