-- Migration 008: mẫu quảng cáo — nhắm đối tượng và ngân sách dùng chung.
--
-- Trước migration này, "Tự động chạy ads" tự khai countries/ageMin/ageMax/
-- dailyBudgetMicros ngay trong params của nó. Khi thêm đường tạo quảng cáo tay,
-- hai đường sẽ khai trùng nhau và trôi xa nhau: sửa nhắm đối tượng ở một chỗ
-- không ảnh hưởng chỗ kia, mà người dùng lại tưởng là cùng một thứ.
--
-- Vì vậy tách ra thành bản ghi riêng, cả hai đường cùng trỏ vào.

CREATE TABLE IF NOT EXISTS ad_template (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  -- Mã quốc gia ISO-3166 alpha-2, vd {VN}.
  countries           TEXT[] NOT NULL DEFAULT ARRAY['VN'],
  age_min             SMALLINT NOT NULL DEFAULT 18,
  age_max             SMALLINT NOT NULL DEFAULT 65,
  daily_budget_micros BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, name),
  CONSTRAINT ad_template_age_ck    CHECK (age_max >= age_min AND age_min >= 13 AND age_max <= 65),
  CONSTRAINT ad_template_budget_ck CHECK (daily_budget_micros > 0),
  CONSTRAINT ad_template_geo_ck    CHECK (cardinality(countries) > 0)
);

CREATE INDEX IF NOT EXISTS ad_template_owner_idx ON ad_template (owner_id, name);

COMMENT ON TABLE ad_template IS
  'Nhắm đối tượng + ngân sách dùng chung cho cả tạo quảng cáo tay lẫn cấu hình '
  'Tự động chạy ads. Cố ý KHÔNG chứa nội dung quảng cáo — nội dung luôn là một '
  'bài viết có sẵn trên Page, tham chiếu qua object_story_id.';

-- Nhật ký cần phân biệt quảng cáo do người bấm tay với quảng cáo do bot tạo.
ALTER TABLE ad_mutation
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'automation';

COMMENT ON COLUMN ad_mutation.source IS
  '''automation'' = do cấu hình chạy theo lịch; ''manual'' = do người dùng bấm '
  'tay. Không có cột này thì không tách được trách nhiệm khi soát lại về sau.';
