// Đặc tả Đăng nhanh TikTok (Spark Ads: đẩy bài đăng có sẵn của kênh TikTok) —
// KHÔNG import gì, dùng chung cho form ở trình duyệt và route ở server.

export type TtObjective = 'VIDEO_VIEWS' | 'REACH' | 'TRAFFIC' | 'ENGAGEMENT';

/**
 * url: 'required' (TRAFFIC), 'optional' (gắn link + nút kêu gọi dưới video),
 * 'none' (ENGAGEMENT tối ưu theo dõi — tài liệu: KHÔNG gửi nút kêu gọi và link).
 * Mục tiêu tối ưu và cách tính phí theo bảng chính thức (adgroup/create, CBO).
 */
export const TT_OBJECTIVES: {
  id: TtObjective; label: string; body: string; url: 'required' | 'optional' | 'none';
  goal: string; billing: string;
}[] = [
  { id: 'VIDEO_VIEWS', label: 'Lượt xem video', body: 'Đẩy bài tới người hay xem lâu. Rẻ nhất để tăng độ phủ cho một bài.', url: 'optional', goal: 'ENGAGED_VIEW', billing: 'CPV' },
  { id: 'REACH', label: 'Phạm vi tiếp cận', body: 'Hiển thị bài cho nhiều người nhất trong ngân sách.', url: 'optional', goal: 'REACH', billing: 'CPM' },
  { id: 'TRAFFIC', label: 'Lưu lượng truy cập', body: 'Đưa người xem bấm sang trang web. Cần link đích.', url: 'required', goal: 'CLICK', billing: 'CPC' },
  { id: 'ENGAGEMENT', label: 'Theo dõi kênh', body: 'Tăng lượt theo dõi kênh TikTok. Không gắn link.', url: 'none', goal: 'FOLLOWERS', billing: 'OCPM' },
];

export const TT_AGES = [
  { id: 'AGE_18_24', label: '18–24' }, { id: 'AGE_25_34', label: '25–34' },
  { id: 'AGE_35_44', label: '35–44' }, { id: 'AGE_45_54', label: '45–54' },
  { id: 'AGE_55_100', label: '55+' },
] as const;

/** Chỉ một phần enum call_to_action của TikTok — những nút hợp với đẩy bài. */
export const TT_CTAS = [
  { id: 'LEARN_MORE', label: 'Tìm hiểu thêm' }, { id: 'SIGN_UP', label: 'Đăng ký' },
  { id: 'CONTACT_US', label: 'Liên hệ' }, { id: 'SHOP_NOW', label: 'Mua ngay' },
  { id: 'APPLY_NOW', label: 'Ứng tuyển ngay' }, { id: 'BOOK_NOW', label: 'Đặt ngay' },
] as const;

/**
 * Ngân sách ngày tối thiểu của nhóm quảng cáo: 20 USD quy đổi theo tỉ lệ của
 * tiền tệ (VND ×10.000 → 200.000đ). Tiền tệ khác để TikTok tự kiểm.
 */
export function minDailyBudget(currency: string): number | null {
  return currency === 'VND' ? 200_000 : currency === 'USD' ? 20 : null;
}

export interface TtQuickSpec {
  objective: TtObjective;
  campaignName: string;
  /** Đơn vị tiền tệ của tài khoản (có thể có phần lẻ). */
  dailyBudget: number;
  identity: { id: string; type: string; bcId?: string | null };
  itemId: string;
  /** ID vị trí TikTok. */
  locationIds: string[];
  ageGroups: string[];
  gender: 'GENDER_UNLIMITED' | 'GENDER_MALE' | 'GENDER_FEMALE';
  landingPageUrl?: string;
  callToAction?: string;
}

export function checkTtSpec(s: TtQuickSpec, currency: string): string[] {
  const errs: string[] = [];
  if (!s.campaignName.trim()) errs.push('Thiếu tên chiến dịch');
  const min = minDailyBudget(currency);
  if (!(s.dailyBudget > 0)) errs.push('Ngân sách phải lớn hơn 0');
  else if (min !== null && s.dailyBudget < min) errs.push(`Ngân sách ngày tối thiểu ${min.toLocaleString('vi-VN')} ${currency}`);
  if (!s.identity.id) errs.push('Chọn kênh TikTok');
  if (!s.itemId) errs.push('Chọn bài đăng');
  if (!s.locationIds.length) errs.push('Chọn ít nhất một vị trí');
  if (!s.ageGroups.length) errs.push('Chọn ít nhất một nhóm tuổi');
  const mode = TT_OBJECTIVES.find((o) => o.id === s.objective)?.url ?? 'none';
  const link = (s.landingPageUrl ?? '').trim();
  if (mode === 'required' || (mode === 'optional' && link && link !== 'https://')) {
    try {
      const u = new URL(link);
      if (!/^https?:$/.test(u.protocol)) errs.push('Link đích phải bắt đầu bằng http:// hoặc https://');
    } catch { errs.push(mode === 'required' ? 'Mục tiêu Lưu lượng truy cập cần link đích hợp lệ' : 'Link đích không hợp lệ (bỏ trống nếu không cần)'); }
  }
  return errs;
}
