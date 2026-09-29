-- Migration 004: giữ objective gốc + thêm loại 'engagement'.
--
-- Phát hiện khi đối chiếu tài khoản thật: 16/274 chiến dịch mang objective
-- OUTCOME_ENGAGEMENT, mà mapObjective() không nhận ra nên rơi vào 'unknown'.
-- Chiến dịch 'unknown' không đếm được chuyển đổi → CPA không tính được →
-- guard xếp vĩnh viễn vào "chưa đủ dữ liệu" → auto_pause KHÔNG BAO GIỜ đụng tới.
--
-- Hai thay đổi:
--   * thêm 'engagement' vào enum
--   * lưu chuỗi gốc Facebook trả về, để lần sau gặp objective lạ còn truy được
--     thay vì mất dấu trong 'unknown'

ALTER TYPE ad_objective_t ADD VALUE IF NOT EXISTS 'engagement';

ALTER TABLE ad_campaign
  ADD COLUMN IF NOT EXISTS objective_raw TEXT;

COMMENT ON COLUMN ad_campaign.objective_raw IS
  'Chuỗi objective nguyên bản từ nền tảng (vd OUTCOME_ENGAGEMENT). Cột '
  'objective là bản đã ánh xạ — ánh xạ sai thì cột này là cách duy nhất truy lại.';

-- Chỉ số nào được dùng để đếm chuyển đổi. NULL = chưa đo được lần nào.
-- Người dùng phải biết hệ thống đang đếm theo cái gì, nếu không thì con số
-- CPA là hộp đen.
ALTER TABLE ad_metric_daily
  ADD COLUMN IF NOT EXISTS conversion_action TEXT;

COMMENT ON COLUMN ad_metric_daily.conversion_action IS
  'action_type dùng để tính cột conversions. NULL nghĩa là không tìm được '
  'hành động nào khớp mục tiêu — CPA của dòng đó vô nghĩa.';
