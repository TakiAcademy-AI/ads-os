-- Migration 006: giữ ngân sách gốc để tính phần trăm theo khung giờ.
--
-- Cấu hình ngân sách đặt theo PHẦN TRĂM so với ngân sách gốc (vd 19-22h chạy
-- 150%). Nhưng sau lần đổi đầu tiên, daily_budget_micros trên ad_campaign đã là
-- con số ĐÃ NHÂN — lấy nó làm gốc cho lần sau là nhân dồn: 150% rồi lại 150%
-- thành 225%, vài ngày là ngân sách nổ.
--
-- Vì vậy phải chốt ngân sách gốc một lần, và mọi phép tính đều dựa vào nó.

ALTER TABLE ad_campaign
  ADD COLUMN IF NOT EXISTS base_daily_budget_micros BIGINT;

COMMENT ON COLUMN ad_campaign.base_daily_budget_micros IS
  'Ngân sách/ngày trước khi tự động hoá đụng vào. Ghi MỘT LẦN, lúc đổi đầu tiên. '
  'Mọi phần trăm tính từ đây, không tính từ daily_budget_micros hiện tại — '
  'nếu không sẽ nhân dồn qua mỗi lượt chạy.';

-- Thêm loại thao tác cho nhật ký. 'budget_change' đã có từ migration 001.
-- Ở đây chỉ bổ sung chỉ mục để trang Nhật ký lọc theo loại cho nhanh.
CREATE INDEX IF NOT EXISTS ad_mutation_operation_idx
  ON ad_mutation (ad_account_id, operation, created_at DESC);
