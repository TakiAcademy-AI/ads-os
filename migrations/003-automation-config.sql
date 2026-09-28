-- Migration 003: cấu hình tự động hoá là thực thể bậc nhất.
--
-- Trước đây ngưỡng CPA nằm ở bảng cpa_target, whitelist là cột boolean trên
-- ad_campaign — rải rác, không liệt kê được, không bật/tắt từng cái. Một tài
-- khoản chạy nhiều luồng tự động song song thì cần mỗi luồng là một bản ghi
-- có tên, trạng thái, tần suất riêng.
--
-- params là JSONB vì bốn loại cấu hình có tham số khác hẳn nhau. Đổi lại,
-- mọi đường ghi phải validate bằng Zod trước khi lưu (src/lib/configs/schema.ts)
-- — JSONB không có ai canh giúp.

DO $$ BEGIN
  CREATE TYPE automation_kind_t AS ENUM (
    'metric_sync',      -- kéo chỉ số về
    'auto_pause',       -- tắt ads theo ngưỡng CPA
    'budget_schedule',  -- tăng giảm ngân sách theo khung giờ
    'post_trigger'      -- tự tạo campaign khi có bài mới
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE automation_status_t AS ENUM ('draft', 'active', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS automation_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  ad_account_id    UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  kind             automation_kind_t NOT NULL,
  name             TEXT NOT NULL,
  -- Mặc định 'draft': tạo xong KHÔNG tự chạy. Phải bật một cách có ý thức.
  status           automation_status_t NOT NULL DEFAULT 'draft',
  interval_minutes INT NOT NULL DEFAULT 30,
  params           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, kind, name)
);

CREATE INDEX IF NOT EXISTS automation_config_owner_idx
  ON automation_config (owner_id, kind, created_at DESC);

-- Chỉ một cấu hình auto_pause được ACTIVE trên mỗi tài khoản: hai bộ ngưỡng
-- cùng chạy sẽ giẫm chân nhau, và không ai truy được quyết định đến từ đâu.
CREATE UNIQUE INDEX IF NOT EXISTS automation_config_one_active_pause
  ON automation_config (ad_account_id)
  WHERE kind = 'auto_pause' AND status = 'active';

COMMENT ON COLUMN automation_config.params IS
  'Tham số theo loại. Validate bằng Zod ở src/lib/configs/schema.ts trước khi ghi.';

-- ─── Chuyển ngưỡng CPA cũ vào mô hình mới ────────────────────────────────────
--
-- Mỗi tài khoản có cpa_target sẽ thành một cấu hình auto_pause, status 'paused'
-- (không tự bật lên active — người dùng phải chủ động bật).

INSERT INTO automation_config (owner_id, ad_account_id, kind, name, status, interval_minutes, params)
SELECT
  a.owner_id,
  a.id,
  'auto_pause',
  'Tắt ads theo ngưỡng CPA',
  'paused',
  30,
  jsonb_build_object(
    'mode', 'dry_run',
    'targets', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'objective', t.objective,
          'targetCpaMicros', t.target_cpa_micros,
          'attributionDays', t.attribution_days,
          'minConversions', t.min_conversions,
          'minClicks', t.min_clicks))
       FROM cpa_target t WHERE t.ad_account_id = a.id),
      '[]'::jsonb),
    'protectedCampaignIds', COALESCE(
      (SELECT jsonb_agg(c.id) FROM ad_campaign c
       WHERE c.ad_account_id = a.id AND c.is_whitelisted),
      '[]'::jsonb)
  )
FROM ad_account a
WHERE EXISTS (SELECT 1 FROM cpa_target t WHERE t.ad_account_id = a.id)
ON CONFLICT (ad_account_id, kind, name) DO NOTHING;

DROP TABLE IF EXISTS cpa_target;

-- Bỏ cột cũ: whitelist giờ nằm trong params.protectedCampaignIds. Giữ cả hai
-- là hai nguồn sự thật, sớm muộn lệch nhau.
ALTER TABLE ad_campaign DROP COLUMN IF EXISTS is_whitelisted;
