// Cấu trúc chi tiết chiến dịch DÙNG CHUNG cho Facebook và Google — giao diện
// chỉ biết cấu trúc này. Không import gì để dùng được cả ở trình duyệt.
//
// "Nhóm" là ad set (Facebook), ad group (Google) hoặc asset group (Performance
// Max). Trạng thái luôn chia hai: `status` là thứ người dùng bật/tắt, còn
// `serving` + `reasons` là việc nền tảng có thật sự cho chạy hay không — hai thứ
// này lệch nhau là chuyện thường (bật rồi nhưng chưa duyệt, hết ngân sách…).

export type Platform = 'facebook' | 'google' | 'tiktok';

export interface DetailIssue {
  /** Mã gốc của nền tảng, giữ lại để tra cứu. */
  code: string;
  /** Diễn giải tiếng Việt. */
  text: string;
  level: 'error' | 'warn' | 'info';
}

export interface DetailCampaign {
  name: string;
  /** Trạng thái người dùng đặt: true = đang bật. */
  enabled: boolean;
  /** Chuỗi gốc: ACTIVE/PAUSED (Facebook), ENABLED/PAUSED (Google). */
  rawStatus: string;
  /** Tóm tắt việc có đang phân phối không, tiếng Việt. */
  serving: string;
  servingLevel: 'ok' | 'warn' | 'error' | 'off';
  issues: DetailIssue[];
  /** Loại chiến dịch (Google) hoặc mục tiêu (Facebook), tiếng Việt. */
  type: string;
  bidding: string | null;
  /** micros; null = ngân sách nằm ở cấp nhóm hoặc không đọc được. */
  dailyBudgetMicros: number | null;
  lifetimeBudgetMicros: number | null;
  /** 'campaign' = sửa ở chiến dịch; 'group' = sửa ở từng nhóm (Facebook ABO). */
  budgetLevel: 'campaign' | 'group' | 'none';
  /** Google: ngân sách dùng chung nhiều chiến dịch → không cho sửa. */
  budgetShared: boolean;
  start: string | null;
  end: string | null;
  /** Link mở thẳng chiến dịch trên giao diện của nền tảng. */
  nativeUrl: string | null;
}

export interface DetailLocation {
  /** Google: criterion ID (để xoá); Facebook: khoá vị trí. */
  criterionId: string;
  geoId: string;
  name: string;
  negative: boolean;
  /** 'campaign' | 'group' — Demand Gen đặt vị trí ở nhóm. */
  level: 'campaign' | 'group';
}

export interface DetailGroup {
  id: string;
  name: string;
  kind: 'adset' | 'ad_group' | 'asset_group';
  enabled: boolean;
  rawStatus: string;
  serving: string;
  servingLevel: 'ok' | 'warn' | 'error' | 'off';
  issues: DetailIssue[];
  dailyBudgetMicros: number | null;
  /** Một dòng tóm tắt nhắm mục tiêu / mục tiêu tối ưu. */
  summary: string | null;
}

export interface DetailAd {
  id: string;
  groupId: string;
  name: string;
  enabled: boolean;
  rawStatus: string;
  serving: string;
  servingLevel: 'ok' | 'warn' | 'error' | 'off';
  issues: DetailIssue[];
  /** Kết quả duyệt: "Đã duyệt", "Đang xem xét", "Bị từ chối: …". */
  review: string | null;
  headlines: string[];
  descriptions: string[];
  finalUrl: string | null;
  thumbnail: string | null;
  type: string;
}

export interface DetailKeyword {
  criterionId: string;
  groupId: string;
  text: string;
  matchType: 'BROAD' | 'PHRASE' | 'EXACT' | string;
  enabled: boolean;
  review: string | null;
}

export interface CampaignDetail {
  platform: Platform;
  externalId: string;
  currency: string;
  campaign: DetailCampaign;
  locations: DetailLocation[];
  languages: { criterionId: string; id: string; name: string }[];
  groups: DetailGroup[];
  ads: DetailAd[];
  keywords: DetailKeyword[];
  /** Phần nào đọc lỗi thì ghi vào đây, trang vẫn hiện phần đọc được. */
  partialErrors: string[];
  /** Chỉnh sửa nào nền tảng/loại chiến dịch này hỗ trợ. */
  can: {
    rename: boolean;
    status: boolean;
    budget: boolean;
    groupStatus: boolean;
    groupBudget: boolean;
    adStatus: boolean;
    locations: boolean;
    keywords: boolean;
  };
}
