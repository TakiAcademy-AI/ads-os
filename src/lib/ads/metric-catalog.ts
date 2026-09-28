// Danh mục chỉ số kéo được từ nền tảng.
//
// `required: true` = chỉ số có cột riêng trong ad_metric_daily, luôn kéo, không
// bỏ được — mọi tính toán CPA và guard attribution dựa vào chúng.
// Còn lại đi vào cột extra_metrics (JSONB): kéo thêm không đổi schema, nhưng
// mỗi chỉ số là một trường trong lời gọi API nên chọn nhiều thì chậm và tốn quota.

export interface MetricField {
  /** Tên trường đúng như API nền tảng trả về. */
  key: string;
  label: string;
  group: 'Định danh' | 'Chi phí' | 'Hiển thị' | 'Tương tác' | 'Chuyển đổi' | 'Video';
  required?: boolean;
  /** Nền tảng có trường này. */
  platforms: ('facebook' | 'tiktok' | 'google')[];
}

const FB_TT_G = ['facebook', 'tiktok', 'google'] as const;
const FB_TT = ['facebook', 'tiktok'] as const;
const FB = ['facebook'] as const;

export const METRIC_CATALOG: MetricField[] = [
  // ── Bắt buộc: có cột riêng trong ad_metric_daily ──
  { key: 'date_start',     label: 'Ngày',              group: 'Định danh',  required: true, platforms: [...FB_TT_G] },
  { key: 'campaign_id',    label: 'ID chiến dịch',     group: 'Định danh',  required: true, platforms: [...FB_TT_G] },
  { key: 'campaign_name',  label: 'Tên chiến dịch',    group: 'Định danh',  required: true, platforms: [...FB_TT_G] },
  { key: 'objective',      label: 'Mục tiêu',          group: 'Định danh',  required: true, platforms: [...FB_TT_G] },
  { key: 'spend',          label: 'Chi tiêu',          group: 'Chi phí',    required: true, platforms: [...FB_TT_G] },
  { key: 'impressions',    label: 'Lượt hiển thị',     group: 'Hiển thị',   required: true, platforms: [...FB_TT_G] },
  { key: 'reach',          label: 'Tiếp cận',          group: 'Hiển thị',   required: true, platforms: [...FB_TT] },
  { key: 'clicks',         label: 'Lượt nhấp',         group: 'Tương tác',  required: true, platforms: [...FB_TT_G] },
  { key: 'actions',        label: 'Chuyển đổi',        group: 'Chuyển đổi', required: true, platforms: [...FB_TT_G] },

  // ── Tuỳ chọn: vào extra_metrics ──
  { key: 'adset_id',       label: 'ID nhóm QC',        group: 'Định danh',  platforms: [...FB_TT] },
  { key: 'adset_name',     label: 'Tên nhóm QC',       group: 'Định danh',  platforms: [...FB_TT] },
  { key: 'ad_id',          label: 'ID quảng cáo',      group: 'Định danh',  platforms: [...FB_TT] },
  { key: 'ad_name',        label: 'Tên quảng cáo',     group: 'Định danh',  platforms: [...FB_TT] },
  { key: 'page_id',        label: 'ID trang',          group: 'Định danh',  platforms: [...FB] },
  { key: 'post_id',        label: 'ID bài viết',       group: 'Định danh',  platforms: [...FB] },

  { key: 'cpc',            label: 'CPC',               group: 'Chi phí',    platforms: [...FB_TT_G] },
  { key: 'cpm',            label: 'CPM',               group: 'Chi phí',    platforms: [...FB_TT_G] },
  { key: 'cpp',            label: 'Chi phí / 1000 tiếp cận', group: 'Chi phí', platforms: [...FB] },
  { key: 'cost_per_action_type', label: 'Chi phí theo loại hành động', group: 'Chi phí', platforms: [...FB] },

  { key: 'frequency',      label: 'Tần suất',          group: 'Hiển thị',   platforms: [...FB] },
  { key: 'ctr',            label: 'CTR',               group: 'Tương tác',  platforms: [...FB_TT_G] },
  { key: 'inline_link_clicks', label: 'Nhấp vào liên kết', group: 'Tương tác', platforms: [...FB] },
  { key: 'unique_clicks',  label: 'Nhấp duy nhất',     group: 'Tương tác',  platforms: [...FB] },

  { key: 'action_values',  label: 'Giá trị chuyển đổi', group: 'Chuyển đổi', platforms: [...FB] },
  { key: 'purchase_roas',  label: 'ROAS mua hàng',     group: 'Chuyển đổi', platforms: [...FB] },
  { key: 'conversions',    label: 'Chuyển đổi (chuẩn)', group: 'Chuyển đổi', platforms: [...FB_TT_G] },

  { key: 'video_p25_watched_actions',  label: 'Xem 25% video',  group: 'Video', platforms: [...FB] },
  { key: 'video_p50_watched_actions',  label: 'Xem 50% video',  group: 'Video', platforms: [...FB] },
  { key: 'video_p75_watched_actions',  label: 'Xem 75% video',  group: 'Video', platforms: [...FB] },
  { key: 'video_p100_watched_actions', label: 'Xem hết video',  group: 'Video', platforms: [...FB] },
  { key: 'video_avg_time_watched_actions', label: 'Thời lượng xem TB', group: 'Video', platforms: [...FB] },
];

export const REQUIRED_KEYS = METRIC_CATALOG.filter((m) => m.required).map((m) => m.key);

export function fieldsFor(platform: string): MetricField[] {
  return METRIC_CATALOG.filter((m) => (m.platforms as string[]).includes(platform));
}

export const GROUPS = ['Định danh', 'Chi phí', 'Hiển thị', 'Tương tác', 'Chuyển đổi', 'Video'] as const;
