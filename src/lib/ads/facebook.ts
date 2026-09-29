// Facebook Marketing API — CHỈ ĐỌC.
//
// Không có hàm nào ghi lên tài khoản quảng cáo. Khi thêm lớp ghi, nó phải nằm
// ở file riêng và đi qua guard attribution + ghi ad_mutation.

import { minorToMicros } from './currency';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';
const TIMEOUT_MS = 25_000;
const MAX_RETRY = 3;

export class FacebookError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly isTokenProblem = false,
  ) {
    super(message);
    this.name = 'FacebookError';
  }
}

interface GraphError {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
}

/**
 * Gọi Graph API với timeout + retry.
 *
 * Chỉ thử lại lỗi 5xx và lỗi mạng. Lỗi 4xx (token hỏng, thiếu quyền, tham số
 * sai) thử lại vô nghĩa — chỉ làm chậm và tốn quota.
 */
async function graph<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH}/${VERSION}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Token đi trong header, không nhét vào query — query string hay bị ghi log.
  const headers = { Authorization: `Bearer ${token}` };

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return (await res.json()) as T;

      const body = (await res.json().catch(() => ({}))) as { error?: GraphError };
      const e = body.error ?? {};
      const msg = e.message ?? `Graph API trả HTTP ${res.status}`;

      // 190 = token hỏng/hết hạn; 102 = phiên không hợp lệ; 10/200 = thiếu quyền.
      const tokenProblem = e.code === 190 || e.code === 102;
      if (res.status >= 400 && res.status < 500) {
        throw new FacebookError(msg, e.code, e.error_subcode, tokenProblem);
      }

      lastErr = new FacebookError(msg, e.code, e.error_subcode);
    } catch (err) {
      clearTimeout(timer);
      // Lỗi 4xx đã dựng ở trên — ném thẳng, không thử lại.
      if (err instanceof FacebookError && err.code !== undefined) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
    }

    // Backoff 1s, 2s — đủ để vượt qua lỗi tạm thời mà không treo request quá lâu.
    if (attempt < MAX_RETRY - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new FacebookError(
    `Gọi Facebook thất bại sau ${MAX_RETRY} lần: ${lastErr?.message ?? 'không rõ'}`,
  );
}

/** Đi hết các trang của một endpoint phân trang. */
async function graphAll<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const p = { ...params, limit: params.limit ?? '200', ...(after ? { after } : {}) };
    const res = await graph<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      path, p, token,
    );
    out.push(...(res.data ?? []));
    // Hết trang khi không còn `next` — chỉ có cursor mà không có next là trang cuối.
    if (!res.paging?.next) break;
    after = res.paging.cursors?.after;
    if (!after) break;
  }
  return out;
}

// ─── Tài khoản quảng cáo ─────────────────────────────────────────────────────

export interface FbAdAccount {
  id: string;           // 'act_<số>'
  account_id: string;   // chỉ phần số
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number; // 1 = đang hoạt động
}

export async function listAdAccounts(token: string): Promise<FbAdAccount[]> {
  return graphAll<FbAdAccount>(
    '/me/adaccounts',
    { fields: 'id,account_id,name,currency,timezone_name,account_status' },
    token,
  );
}

/** Người dùng Facebook đứng sau token. Cần để xử lý yêu cầu xoá dữ liệu. */
export async function fbMe(token: string): Promise<{ id: string; name?: string }> {
  return graph<{ id: string; name?: string }>('/me', { fields: 'id,name' }, token);
}

// ─── Chiến dịch ──────────────────────────────────────────────────────────────

export interface FbCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
}

export async function listCampaigns(token: string, actId: string): Promise<FbCampaign[]> {
  return graphAll<FbCampaign>(
    `/${actId}/campaigns`,
    { fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time' },
    token,
  );
}

// ─── Số liệu ─────────────────────────────────────────────────────────────────

export interface FbAction { action_type: string; value: string }

export interface FbInsight {
  date_start: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  actions?: FbAction[];
  [key: string]: unknown;
}

const BASE_FIELDS = [
  'date_start', 'spend', 'impressions', 'reach', 'clicks', 'ctr', 'actions',
];

export async function fetchInsights(
  token: string,
  actId: string,
  opts: {
    since: string;
    until: string;
    level: 'campaign' | 'adset' | 'ad';
    /** Chỉ số tuỳ chọn ngoài nhóm bắt buộc. */
    extraFields?: string[];
  },
): Promise<FbInsight[]> {
  const fields = [
    ...BASE_FIELDS,
    'campaign_id', 'campaign_name',
    ...(opts.level === 'adset' || opts.level === 'ad' ? ['adset_id', 'adset_name'] : []),
    ...(opts.level === 'ad' ? ['ad_id', 'ad_name'] : []),
    ...(opts.extraFields ?? []).filter((f) => !BASE_FIELDS.includes(f)),
  ];

  return graphAll<FbInsight>(
    `/${actId}/insights`,
    {
      fields: [...new Set(fields)].join(','),
      level: opts.level,
      time_range: JSON.stringify({ since: opts.since, until: opts.until }),
      // Tách theo ngày — bắt buộc, vì guard attribution cần số theo từng ngày
      // chứ không phải tổng cả kỳ.
      time_increment: '1',
      limit: '500',
    },
    token,
  );
}

// ─── Quy đổi ─────────────────────────────────────────────────────────────────

/**
 * Chi tiêu → micros.
 *
 * BẪY: Facebook trả spend theo ĐƠN VỊ NHỎ NHẤT của tiền tệ. USD trả cents
 * ("1234" = 12.34 USD), còn VND không có đơn vị phụ nên trả thẳng đồng
 * ("50000" = 50.000đ). Dùng chung một hệ số là sai 100 lần.
 */
export function spendToMicros(spend: string | undefined, currency: string): number {
  // Hệ số nằm ở lib/ads/currency.ts — một nguồn duy nhất cho cả chiều đọc lẫn
  // chiều ghi. Trước đây mỗi chỗ tự định nghĩa và chúng lệch nhau.
  return minorToMicros(spend, currency);
}

/**
 * Hành động tính là "chuyển đổi", theo mục tiêu chiến dịch.
 *
 * Thứ tự trong mảng là thứ tự ƯU TIÊN: lấy loại đầu tiên tìm thấy, không cộng
 * dồn nhiều loại. Cộng dồn sẽ đếm trùng — Facebook trả cả `purchase` lẫn
 * `omni_purchase` cho cùng một đơn hàng.
 *
 * CỐ Ý không có phương án dự phòng chung: một chiến dịch mục tiêu mua hàng mà
 * 0 đơn thì phải ra 0, không được tụt xuống đếm click cho đẹp. Đếm click thay
 * đơn hàng làm CPA rẻ giả tạo và guard sẽ không bao giờ tắt gì.
 */
const CONVERSION_ACTIONS: Record<string, string[]> = {
  messages: [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
  ],
  leads: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  sales: ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'],
  // Mục tiêu traffic không có "chuyển đổi" theo nghĩa bán hàng — thứ gần nhất
  // là lượt xem trang đích, rồi mới tới lượt nhấp.
  traffic: ['landing_page_view', 'link_click'],
  // OUTCOME_ENGAGEMENT gộp nhiều thứ: nhắn tin, tương tác bài, xem video.
  // Ưu tiên tin nhắn vì ở VN phần lớn chiến dịch loại này là nhắn tin.
  engagement: [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'post_engagement',
    'link_click',
  ],
  video_views: ['video_view'],
  // Nhận diện thương hiệu không có chuyển đổi — để trống là đúng, không phải thiếu.
  awareness: [],
};

export interface ConversionCount {
  count: number;
  /** action_type đã dùng. null = không tìm được hành động nào khớp mục tiêu. */
  actionType: string | null;
}

/**
 * Đếm chuyển đổi khớp mục tiêu chiến dịch.
 *
 * Trả về cả loại hành động đã dùng — người dùng phải biết con số CPA đang dựa
 * trên cái gì, nếu không nó là hộp đen. `actionType === null` nghĩa là hệ
 * thống KHÔNG ĐO ĐƯỢC chiến dịch này, khác hẳn với "đo được và bằng 0".
 */
export function countConversions(
  actions: FbAction[] | undefined,
  objective: string,
): ConversionCount {
  const wanted = CONVERSION_ACTIONS[objective];
  if (!wanted?.length || !actions?.length) return { count: 0, actionType: null };

  for (const type of wanted) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return { count: Number(hit.value) || 0, actionType: type };
  }
  return { count: 0, actionType: null };
}

/**
 * Ánh xạ objective của Facebook về enum ad_objective_t.
 *
 * Facebook đã chuyển sang bộ tên ODAX (OUTCOME_*), nhưng tài khoản cũ vẫn còn
 * chiến dịch mang tên đời trước (LINK_CLICKS, CONVERSIONS...). Phải nhận cả hai.
 */
export function mapObjective(fb: string): string {
  const o = fb.toUpperCase();
  if (o.includes('MESSAG')) return 'messages';
  if (o.includes('LEAD')) return 'leads';
  if (o.includes('SALES') || o.includes('CONVERSION') || o.includes('CATALOG')) return 'sales';
  if (o.includes('TRAFFIC') || o.includes('LINK_CLICK')) return 'traffic';
  // Phải xét TRƯỚC 'VIDEO': OUTCOME_ENGAGEMENT gộp cả xem video, mà ta muốn
  // giữ nó ở nhóm engagement để còn ưu tiên đếm tin nhắn.
  if (o.includes('ENGAGEMENT') || o.includes('POST_ENGAGEMENT')) return 'engagement';
  if (o.includes('VIDEO')) return 'video_views';
  if (o.includes('AWARENESS') || o.includes('REACH') || o.includes('BRAND')) return 'awareness';
  return 'unknown';
}

export const API_VERSION = VERSION;
