-- Migration 001: toàn bộ schema Ads OS.
--
-- Tách từ marketing-os, chỉ giữ phần quảng cáo. Viết lại gọn thay vì mang theo
-- lịch sử migration của dự án cũ, và sửa luôn hai chỗ đã biết là bẫy:
--   * ad_metric_daily dùng partial unique index NGAY TỪ ĐẦU (PostgreSQL coi
--     NULL != NULL, nên UNIQUE constraint thường không chặn được dòng cấp
--     account/campaign có cột NULL — dữ liệu sẽ cộng dồn mỗi lần sync).
--     Không tạo UNIQUE constraint song song để khỏi thừa một index phải
--     duy trì mỗi lần ghi.
--   * ad_metric_revision tách riêng, append-only. ad_metric_daily là "số hiện
--     tại" (upsert); revision là bằng chứng số bị platform sửa hồi tố.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Người dùng ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role_t AS ENUM ('admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app_user (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          user_role_t NOT NULL DEFAULT 'member',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tài khoản quảng cáo ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ad_platform_t AS ENUM ('facebook', 'google', 'tiktok');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_account_status_t AS ENUM ('pending', 'active', 'disconnected', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_objective_t AS ENUM (
    'messages', 'leads', 'sales', 'traffic', 'awareness', 'video_views', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ad_account (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  platform        ad_platform_t NOT NULL,
  -- FB: act_<id> hoặc <id>; Google: customer ID 10 số; TikTok: advertiser_id
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'VND',
  timezone        TEXT,
  -- pgp_sym_encrypt, cùng khoá với ENCRYPTION_KEY của app
  encrypted_token BYTEA,
  status          ad_account_status_t NOT NULL DEFAULT 'pending',
  connected_at    TIMESTAMPTZ,
  last_synced_at  TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, platform, external_id)
);

CREATE TABLE IF NOT EXISTS ad_campaign (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id          UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  external_id            TEXT NOT NULL,
  name                   TEXT NOT NULL,
  objective              ad_objective_t NOT NULL DEFAULT 'unknown',
  status                 TEXT NOT NULL DEFAULT 'unknown',
  -- Micros = giá trị × 1.000.000. Tránh sai số dấu phẩy động với VND.
  daily_budget_micros    BIGINT,
  lifetime_budget_micros BIGINT,
  -- Không bị auto-pause đụng vào, nhưng vẫn gửi cảnh báo khi vượt ngưỡng.
  is_whitelisted         BOOLEAN NOT NULL DEFAULT FALSE,
  start_time             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, external_id)
);

-- ─── Số liệu hiện tại (upsert) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_metric_daily (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id  UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  campaign_id    UUID REFERENCES ad_campaign(id) ON DELETE CASCADE,
  ad_external_id TEXT,
  date           DATE NOT NULL,
  spend_micros   BIGINT NOT NULL DEFAULT 0,
  impressions    BIGINT NOT NULL DEFAULT 0,
  reach          BIGINT NOT NULL DEFAULT 0,
  clicks         BIGINT NOT NULL DEFAULT 0,
  conversions    BIGINT NOT NULL DEFAULT 0,
  ctr            NUMERIC(8, 6),
  extra_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ba partial unique index cho ba cấp. PostgreSQL coi NULL != NULL nên một
-- UNIQUE constraint thường sẽ KHÔNG chặn được dòng trùng ở cấp account
-- (campaign_id NULL) — mỗi lần sync lại chèn thêm một dòng, số cộng dồn.
CREATE UNIQUE INDEX IF NOT EXISTS ad_metric_daily_account_uq
  ON ad_metric_daily (ad_account_id, date)
  WHERE campaign_id IS NULL AND ad_external_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ad_metric_daily_campaign_uq
  ON ad_metric_daily (ad_account_id, campaign_id, date)
  WHERE campaign_id IS NOT NULL AND ad_external_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ad_metric_daily_ad_uq
  ON ad_metric_daily (ad_account_id, campaign_id, ad_external_id, date)
  WHERE campaign_id IS NOT NULL AND ad_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ad_metric_daily_range_idx
  ON ad_metric_daily (ad_account_id, date DESC);

-- ─── Lịch sử revision (append-only) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_metric_revision (
  id             BIGSERIAL PRIMARY KEY,
  ad_account_id  UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  campaign_id    UUID REFERENCES ad_campaign(id) ON DELETE CASCADE,
  ad_external_id TEXT,
  date           DATE NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spend_micros   BIGINT NOT NULL DEFAULT 0,
  conversions    BIGINT NOT NULL DEFAULT 0,
  clicks         BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ad_metric_revision_lookup_idx
  ON ad_metric_revision (ad_account_id, campaign_id, ad_external_id, date, fetched_at DESC);

CREATE INDEX IF NOT EXISTS ad_metric_revision_fetched_idx
  ON ad_metric_revision (fetched_at);

COMMENT ON TABLE ad_metric_revision IS
  'Append-only, chỉ ghi khi số đổi. Nhiều dòng cùng (campaign, date) khác '
  'fetched_at = số liệu bị platform sửa hồi tố. Dùng để đo cửa sổ attribution '
  'thật thay vì đoán.';

CREATE OR REPLACE VIEW ad_metric_revision_latest AS
SELECT DISTINCT ON (ad_account_id, campaign_id, ad_external_id, date)
       ad_account_id, campaign_id, ad_external_id, date,
       fetched_at, spend_micros, conversions, clicks
FROM ad_metric_revision
ORDER BY ad_account_id, campaign_id, ad_external_id, date, fetched_at DESC;

-- ─── Ngưỡng CPA theo loại chiến dịch ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cpa_target (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id     UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  objective         ad_objective_t NOT NULL,
  target_cpa_micros BIGINT NOT NULL,
  -- Cửa sổ attribution áp dụng cho loại này. Bắt đầu bằng 7, sau 2-3 tuần
  -- có revision history thì thay bằng số đo được.
  attribution_days  INT NOT NULL DEFAULT 7,
  min_conversions   INT NOT NULL DEFAULT 10,
  min_clicks        INT NOT NULL DEFAULT 100,
  auto_pause        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, objective)
);

-- ─── Nhật ký thay đổi ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ad_mutation_op_t AS ENUM ('pause', 'resume', 'budget_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_mutation_mode_t AS ENUM ('dry_run', 'live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_mutation_status_t AS ENUM (
    'proposed', 'blocked', 'applied', 'failed', 'rolled_back');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ad_mutation (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id      UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  -- Campaign bị xoá vẫn phải giữ nhật ký → SET NULL, không CASCADE.
  campaign_id        UUID REFERENCES ad_campaign(id) ON DELETE SET NULL,
  target_external_id TEXT NOT NULL,
  target_name        TEXT NOT NULL,
  operation          ad_mutation_op_t NOT NULL,
  mode               ad_mutation_mode_t NOT NULL DEFAULT 'dry_run',
  status             ad_mutation_status_t NOT NULL DEFAULT 'proposed',
  before_value       TEXT NOT NULL DEFAULT '',
  after_value        TEXT NOT NULL DEFAULT '',
  reason             TEXT NOT NULL DEFAULT '',
  blocked_by         TEXT,
  cpa_raw_micros     BIGINT,
  cpa_settled_micros BIGINT,
  target_cpa_micros  BIGINT,
  -- '<external_id>:<operation>:<YYYY-MM-DD>' — chạy lại không áp dụng 2 lần
  idempotency_key    TEXT NOT NULL,
  error_message      TEXT,
  applied_at         TIMESTAMPTZ,
  rolled_back_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ad_mutation_time_idx
  ON ad_mutation (ad_account_id, created_at DESC);

COMMENT ON TABLE ad_mutation IS
  'Nhật ký mọi thay đổi lên tài khoản QC, gồm cả dry_run và lần bị guard chặn. '
  'Nhật ký thiếu thì không ai dám bật auto — ghi đủ mới có giá trị.';

-- ─── Log đồng bộ ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_log (
  id            BIGSERIAL PRIMARY KEY,
  ad_account_id UUID REFERENCES ad_account(id) ON DELETE CASCADE,
  job           TEXT NOT NULL,
  ok            BOOLEAN NOT NULL,
  rows_written  INT NOT NULL DEFAULT 0,
  duration_ms   INT,
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_log_time_idx ON sync_log (created_at DESC);
