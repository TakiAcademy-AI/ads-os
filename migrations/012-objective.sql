-- Migration 012: chọn được mục tiêu chiến dịch.
--
-- Trước migration này mục tiêu bị đóng cứng trong code: OUTCOME_ENGAGEMENT /
-- POST_ENGAGEMENT / ON_POST. Mọi quảng cáo Ads OS tạo ra đều là "đẩy bài viết",
-- trong khi ở Việt Nam phần lớn quảng cáo nhỏ chạy mục tiêu Tin nhắn.
--
-- Hệ quả âm thầm đáng chú ý: DEFAULT_TARGETS không có ngưỡng CPA cho
-- 'engagement', nên chiến dịch do chính web tạo ra rơi vào nhánh no_target và
-- cơ chế tắt tự động không bao giờ đụng tới. Mở mục tiêu Tin nhắn/Chuyển đổi
-- là nối lại hai nửa đó.

ALTER TABLE ad_template
  -- Khoá nội bộ, KHÔNG phải chuỗi của Facebook. Ánh xạ sang objective /
  -- optimization_goal / destination_type / promoted_object nằm ở
  -- src/lib/ads/objectives.ts — bốn trường đó phải khớp nhau theo bộ.
  ADD COLUMN IF NOT EXISTS objective TEXT NOT NULL DEFAULT 'engagement',

  -- Chỉ dùng cho objective = 'sales'. Để NULL với hai mục tiêu kia.
  ADD COLUMN IF NOT EXISTS pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS conversion_event TEXT;

-- Chặn ở tầng dữ liệu chứ không chỉ ở Zod: mẫu 'sales' mà thiếu pixel hoặc sự
-- kiện thì chuỗi tạo quảng cáo sẽ hỏng ở bước adset, sau khi đã tạo chiến dịch.
-- Thà không lưu được còn hơn lưu rồi hỏng lúc chạy.
ALTER TABLE ad_template
  DROP CONSTRAINT IF EXISTS ad_template_objective_ck;
ALTER TABLE ad_template
  ADD CONSTRAINT ad_template_objective_ck CHECK (
    objective IN ('engagement', 'messages', 'sales')
    AND (objective <> 'sales' OR (pixel_id IS NOT NULL AND conversion_event IS NOT NULL))
  );

COMMENT ON COLUMN ad_template.objective IS
  'Khoá nội bộ: engagement | messages | sales. Bộ tham số Facebook tương ứng ở '
  'src/lib/ads/objectives.ts, đã dò bằng validate_only trên tài khoản thật.';

COMMENT ON COLUMN ad_template.conversion_event IS
  'custom_event_type cho promoted_object. INITIATE_CHECKOUT và LEAD bị Facebook '
  'từ chối với OUTCOME_SALES — danh sách dùng được ở CONVERSION_EVENTS.';
