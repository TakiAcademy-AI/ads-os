-- Migration 011: nhắm đối tượng đầy đủ cho mẫu quảng cáo.
--
-- Trước migration này mẫu chỉ có quốc gia và khoảng tuổi. Đối chiếu với một
-- nhóm quảng cáo THẬT do người dùng tạo tay trong Ads Manager cho thấy thiếu
-- bảy trường: genders, publisher_platforms, facebook_positions,
-- instagram_positions, messenger_positions, audience_network_positions,
-- age_range.
--
-- Hệ quả thực tế: boost một bài cho toàn bộ dân số 18–65 của cả nước gần như
-- chắc chắn ra CPA xấu. Người chạy quảng cáo ở Việt Nam nhắm theo sở thích và
-- theo tỉnh/thành là chuyện thường ngày.

ALTER TABLE ad_template
  -- {1} = nam, {2} = nữ, rỗng = mọi giới. Đây là quy ước của Facebook, không
  -- phải lựa chọn của ta — đổi sang kiểu khác là phải dịch lại ở lớp gửi.
  ADD COLUMN IF NOT EXISTS genders SMALLINT[] NOT NULL DEFAULT '{}',

  -- [{id, name}] lấy từ targeting search của Facebook. Lưu cả tên để giao diện
  -- hiển thị lại được mà không phải gọi API mỗi lần mở trang.
  ADD COLUMN IF NOT EXISTS interests JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- [{type, key, name}] — type là 'city' hoặc 'region'. KHÔNG rỗng thì thay thế
  -- hoàn toàn phần quốc gia: nhắm Hà Nội thì không nhắm cả Việt Nam nữa.
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- {automatic: bool, publisher_platforms: [], facebook_positions: [],
  --  instagram_positions: []}
  -- automatic = true thì BỎ HẲN mọi trường vị trí khỏi payload, để Facebook tự
  -- phân phối. Gửi danh sách rỗng khác hẳn với không gửi gì — danh sách rỗng là
  -- "không hiển thị ở đâu cả".
  ADD COLUMN IF NOT EXISTS placements JSONB NOT NULL DEFAULT '{"automatic":true}'::jsonb,

  -- Advantage+ Audience: cho Facebook nới ra ngoài đối tượng đã khai.
  -- Mặc định TẮT — người dùng khai tuổi và sở thích thì phải được tôn trọng.
  -- Nhưng quảng cáo thật trong tài khoản của họ đang bật, nên cho chọn.
  ADD COLUMN IF NOT EXISTS advantage_audience BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ad_template.genders IS
  'Quy ước Facebook: 1=nam, 2=nữ. Mảng rỗng = mọi giới (bỏ trường khỏi payload).';

COMMENT ON COLUMN ad_template.locations IS
  'Tỉnh/thành cụ thể. Không rỗng thì THAY THẾ countries, không cộng thêm — '
  'nhắm Hà Nội mà vẫn gửi kèm cả nước là nhắm cả nước.';

COMMENT ON COLUMN ad_template.placements IS
  'automatic=true thì KHÔNG gửi trường vị trí nào. Gửi mảng rỗng nghĩa là '
  '"không hiển thị ở đâu" — khác hẳn với để Facebook tự chọn.';
