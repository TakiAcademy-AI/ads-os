// Đặc tả và giới hạn của chiến dịch Đăng nhanh Google — KHÔNG import gì, để
// dùng chung cho form ở trình duyệt và route ở server: hai bên kiểm cùng một bộ
// quy tắc, sửa một chỗ là đủ.
//
// Giới hạn đã đối chiếu bằng validateOnly trên tài khoản thật (10/2026).

export type GoogleCampaignKind = 'SEARCH' | 'DISPLAY' | 'PERFORMANCE_MAX' | 'DEMAND_GEN';
export type GoogleBidding = 'MAXIMIZE_CLICKS' | 'MAXIMIZE_CONVERSIONS';
export type KeywordMatch = 'BROAD' | 'PHRASE' | 'EXACT';

export interface GoogleCreateSpec {
  kind: GoogleCampaignKind;
  name: string;
  dailyBudgetMicros: number;
  bidding: GoogleBidding;
  /** Chỉ dùng với MAXIMIZE_CONVERSIONS. Bỏ trống = để Google tự tối ưu. */
  targetCpaMicros?: number | null;
  /** ID geo target constant, vd '2704' = Việt Nam. */
  geoTargets: string[];
  /** ID language constant, vd '1040' = tiếng Việt. */
  languages: string[];
  finalUrl: string;
  headlines: string[];
  /** Display: đúng 1. Performance Max: 1–5. Loại khác bỏ qua. */
  longHeadlines?: string[];
  descriptions: string[];
  /** Bắt buộc với Display, Performance Max, Demand Gen. */
  businessName?: string;
  /** Search: hai đoạn đường dẫn hiển thị sau tên miền. */
  path1?: string;
  path2?: string;
  /** Search: bắt buộc ít nhất một. */
  keywords?: { text: string; matchType: KeywordMatch }[];
  /** Ảnh dạng base64 (không kèm tiền tố data:), đã cắt đúng tỉ lệ ở trình duyệt. */
  images?: { landscape: string[]; square: string[]; logo: string[] };
}

/** Giới hạn của Google cho từng loại — dùng cả để validate lẫn hiện ở giao diện. */
export const LIMITS: Record<GoogleCampaignKind, {
  headlines: [number, number, number];
  longHeadlines: [number, number, number] | null;
  descriptions: [number, number, number];
  businessName: boolean;
  keywords: boolean;
  images: { landscape: number; square: number; logo: number } | null;
  bidding: GoogleBidding[];
}> = {
  // [tối thiểu, tối đa, số ký tự tối đa]
  SEARCH: {
    headlines: [3, 15, 30], longHeadlines: null, descriptions: [2, 4, 90],
    businessName: false, keywords: true, images: null,
    bidding: ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS'],
  },
  DISPLAY: {
    headlines: [1, 5, 30], longHeadlines: [1, 1, 90], descriptions: [1, 5, 90],
    businessName: true, keywords: false, images: { landscape: 1, square: 1, logo: 0 },
    bidding: ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS'],
  },
  PERFORMANCE_MAX: {
    headlines: [3, 15, 30], longHeadlines: [1, 5, 90], descriptions: [2, 5, 90],
    businessName: true, keywords: false, images: { landscape: 1, square: 1, logo: 1 },
    // PMax chỉ nhận chiến lược theo chuyển đổi.
    bidding: ['MAXIMIZE_CONVERSIONS'],
  },
  DEMAND_GEN: {
    headlines: [1, 5, 40], longHeadlines: null, descriptions: [1, 5, 90],
    businessName: true, keywords: false, images: { landscape: 1, square: 1, logo: 1 },
    bidding: ['MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CLICKS'],
  },
};

/** Kiểm đầu vào theo giới hạn của loại chiến dịch. Trả danh sách lỗi đọc được. */
export function checkSpec(s: GoogleCreateSpec): string[] {
  const L = LIMITS[s.kind];
  const errs: string[] = [];
  const list = (label: string, items: string[] | undefined, [min, max, len]: [number, number, number]) => {
    const xs = (items ?? []).map((x) => x.trim()).filter(Boolean);
    if (xs.length < min || xs.length > max) errs.push(`${label}: cần ${min === max ? min : `${min}–${max}`}, đang có ${xs.length}`);
    const long = xs.filter((x) => [...x].length > len);
    if (long.length) errs.push(`${label} quá ${len} ký tự: "${long[0]}"`);
  };
  list('Tiêu đề', s.headlines, L.headlines);
  if (L.longHeadlines) list('Tiêu đề dài', s.longHeadlines, L.longHeadlines);
  list('Mô tả', s.descriptions, L.descriptions);
  if (L.businessName) {
    const b = (s.businessName ?? '').trim();
    if (!b) errs.push('Thiếu tên doanh nghiệp');
    else if ([...b].length > 25) errs.push('Tên doanh nghiệp quá 25 ký tự');
  }
  if (L.keywords && !(s.keywords ?? []).some((k) => k.text.trim())) errs.push('Cần ít nhất một từ khoá');
  if (L.images) {
    const im = s.images ?? { landscape: [], square: [], logo: [] };
    if (im.landscape.length < L.images.landscape) errs.push('Thiếu ảnh ngang 1.91:1');
    if (im.square.length < L.images.square) errs.push('Thiếu ảnh vuông 1:1');
    if (im.logo.length < L.images.logo) errs.push('Thiếu logo 1:1');
  }
  if (!L.bidding.includes(s.bidding)) errs.push('Chiến lược giá thầu không dùng được cho loại chiến dịch này');
  if (s.geoTargets.length === 0) errs.push('Chọn ít nhất một vị trí');
  if ((s.path1 ?? '').length > 15 || (s.path2 ?? '').length > 15) errs.push('Đường dẫn hiển thị tối đa 15 ký tự');
  try {
    const u = new URL(s.finalUrl);
    if (!/^https?:$/.test(u.protocol)) errs.push('URL đích phải bắt đầu bằng http:// hoặc https://');
  } catch {
    errs.push('URL đích không hợp lệ');
  }
  return errs;
}
