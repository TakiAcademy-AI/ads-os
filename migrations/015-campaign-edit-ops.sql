-- Migration 015: thao tác chỉnh sửa từ trang Chi tiết chiến dịch.
--
-- Nhật ký trước đây chỉ biết tắt/bật/đổi ngân sách/tạo chiến dịch. Sửa tay từ
-- trang chi tiết thêm ba loại nữa — vẫn phải vào nhật ký như mọi thay đổi khác.

DO $$ BEGIN
  ALTER TYPE ad_mutation_op_t ADD VALUE IF NOT EXISTS 'rename';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE ad_mutation_op_t ADD VALUE IF NOT EXISTS 'targeting_change';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE ad_mutation_op_t ADD VALUE IF NOT EXISTS 'keyword_change';
EXCEPTION WHEN others THEN NULL; END $$;
