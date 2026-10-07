// TikTok API for Business (Marketing API) — lớp gọi API + các hàm ĐỌC.
//
// Lệnh ghi nằm ở tiktok-write.ts, cùng cách tách như Facebook/Google.
//
// NĂM KHÁC BIỆT QUAN TRỌNG (đã đối chiếu tài liệu chính thức, 10/2026):
//
// 1. HTTP LUÔN 200, KỂ CẢ KHI LỖI. Lỗi nằm ở trường `code` trong body (0 = OK).
//    Chỉ kiểm res.ok là coi mọi thất bại thành công.
// 2. TIỀN LÀ ĐƠN VỊ TIỀN TỆ CÓ PHẦN LẺ — "12.50" USD, "200000" VND. Không phải
//    micros (Google), không phải đơn vị nhỏ nhất (Facebook). Số liệu báo cáo
//    trả về dạng CHUỖI.
// 3. Token để ở header `Access-Token`, không phải Authorization: Bearer.
// 4. Đường dẫn PHẢI có dấu / cuối — thiếu là 404.
// 5. Ngày trong báo cáo theo MÚI GIỜ TÀI KHOẢN QUẢNG CÁO, và stat_time_day tối
//    đa 30 ngày một lần gọi.
//
// Phiên bản: dùng v1.3. v2.0 (2026) chỉ đổi phần xác thực và báo cáo, nhưng
// trang báo cáo v2.0 tự mâu thuẫn (tiêu đề ghi POST, mọi ví dụ dùng GET) và bỏ
// hẳn report_type/data_level. Các endpoint chiến dịch/nhóm/quảng cáo giữ
// nguyên trường ở cả hai bản. Đổi TIKTOK_API_VERSION khi đã kiểm v2.0 thật.

import { callTool, toolNameFor, McpAuthError } from './tiktok-mcp';

const HOST = process.env.TIKTOK_API_HOST || 'https://business-api.tiktok.com';
const VERSION = process.env.TIKTOK_API_VERSION || 'v1.3';
const TIMEOUT_MS = 30_000;
const MAX_RETRY = 3;

export class TikTokError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    /** Token hỏng, hết hạn hoặc bị thu hồi — người dùng phải kết nối lại. */
    readonly isAuthProblem = false,
  ) {
    super(message);
    this.name = 'TikTokError';
  }
}

/** Mã lỗi hay gặp → lời giải. Thông điệp gốc của TikTok rất ít khi nói phải sửa ở đâu. */
const HINTS: Record<number, string> = {
  40001: 'Ứng dụng hoặc tài khoản không có quyền với thao tác này — kiểm tra phạm vi quyền (scope) của app TikTok và quyền của người kết nối trên tài khoản quảng cáo.',
  40002: 'Tham số không hợp lệ.',
  40007: 'Đối tượng không tồn tại (có thể đã bị xoá trên TikTok).',
  40100: 'TikTok đang giới hạn tần suất gọi API — thử lại sau vài phút.',
  40102: 'Token TikTok đã hết hạn — kết nối lại.',
  40104: 'Thiếu token TikTok — kết nối lại.',
  40105: 'Token TikTok không hợp lệ hoặc đã bị thu hồi — kết nối lại.',
  40110: 'Mã xác thực (auth_code) không hợp lệ hoặc đã dùng/hết hạn — bấm kết nối lại từ đầu.',
  40113: 'Ứng dụng TikTok bị khoá hoặc không tồn tại — kiểm tra app trên TikTok API for Business.',
  40118: 'Tính năng này cần được TikTok đưa vào danh sách cho phép (allowlist).',
  40300: 'Tài khoản quảng cáo không tồn tại hoặc không thuộc quyền token này.',
};
const AUTH_CODES = new Set([40101, 40102, 40104, 40105, 40107]);
/** Lỗi tạm thời — đọc thì thử lại được. */
const RETRY_CODES = new Set([40100, 40016, 40133, 50000, 50002, 60001]);

interface Envelope<T> { code?: number; message?: string; request_id?: string; data?: T }

/**
 * Cách xác thực của một tài khoản TikTok:
 *  - app: access token của app nhà phát triển → gọi REST trực tiếp
 *  - mcp: access token của TikTok for Business MCP Server → gọi TOOL tương ứng
 * Chuỗi trơn = app (giữ tương thích với chỗ gọi cũ).
 */
export type TtAuth = string | { kind: 'app' | 'mcp'; token: string };

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    // Mảng và object đi dạng JSON trong query — quy ước của TikTok cho GET.
    q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return q.toString();
}

/**
 * Gọi API. GET được thử lại khi lỗi tạm thời; POST (lệnh ghi) KHÔNG BAO GIỜ thử
 * lại — request có thể đã tới nơi, thử lại là tắt hai lần hay đổi ngân sách hai lần.
 */
export async function ttCall<T>(
  method: 'GET' | 'POST',
  path: string,
  auth: TtAuth | null,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const a = typeof auth === 'string' ? { kind: 'app' as const, token: auth } : auth;
  const url = `${HOST}/open_api/${VERSION}/${path.replace(/^\/+/, '').replace(/\/?$/, '/')}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (a?.kind === 'app') headers['Access-Token'] = a.token;
  const tries = method === 'GET' ? MAX_RETRY : 1;
  let last: TikTokError | null = null;

  for (let attempt = 0; attempt < tries; attempt++) {
    let json: Envelope<T>;
    try {
      if (a?.kind === 'mcp') {
        // Cùng endpoint, cùng tham số — chỉ đổi đường đi. Tool nhận object thật,
        // không phải JSON nhét trong query như GET REST.
        json = (await callTool(a.token, toolNameFor(path), payload)) as Envelope<T>;
      } else {
      const res = await fetch(method === 'GET' ? `${url}?${toQuery(payload)}` : url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      json = (await res.json().catch(() => ({ code: res.status, message: `TikTok trả HTTP ${res.status}` }))) as Envelope<T>;
      if (!res.ok && json.code === undefined) json = { code: res.status, message: `TikTok trả HTTP ${res.status}` };
      }
    } catch (e) {
      // Token MCP hết hạn/bị thu hồi: lỗi xác thực, không thử lại.
      if (e instanceof McpAuthError) throw new TikTokError(e.message, 40105, true);
      last = new TikTokError(`Không gọi được TikTok: ${e instanceof Error ? e.message : String(e)}`);
      if (attempt < tries - 1) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
      throw last;
    }

    // 20001 = thành công một phần — vẫn có data, nơi gọi tự xem chi tiết.
    if (json.code === 0 || json.code === 20001) return json.data as T;

    const code = json.code ?? -1;
    // MCP Server đang mở dần từng tool theo tài khoản: tool có trong danh sách
    // nhưng gọi thì báo "being rolled out … (NOT_AVAILABLE)". Không phải lỗi
    // tham số — nói rõ để người dùng không sửa đi sửa lại cấu hình.
    const msg = json.message ?? '';
    if (/NOT_AVAILABLE|being rolled out/i.test(msg)) {
      const when = /availability:\s*([^(.]+)/i.exec(msg)?.[1]?.trim();
      throw new TikTokError(
        `TikTok chưa mở chức năng này qua kết nối MCP cho tài khoản quảng cáo này`
        + (when ? ` (TikTok dự kiến: ${when})` : '')
        + `. Làm thao tác này trong TikTok Ads Manager, hoặc kết nối tài khoản bằng app nhà phát triển `
        + `(Kết nối → TikTok → Đăng nhập qua app TikTok) khi app được TikTok duyệt — kết nối qua app không bị giới hạn này.`
        + ` (${msg})`,
        code,
      );
    }
    const hint = HINTS[code];
    last = new TikTokError(
      hint ? `${hint} (${code}: ${json.message ?? ''})` : `${json.message ?? 'Lỗi không rõ'} (${code})`,
      code,
      AUTH_CODES.has(code),
    );
    if (!RETRY_CODES.has(code) || attempt >= tries - 1) throw last;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw last ?? new TikTokError('Lỗi không rõ');
}

interface PageInfo { page?: number; total_page?: number }

/** Đi hết các trang của một endpoint dạng list. */
async function ttAll<T>(path: string, token: TtAuth, params: Record<string, unknown>, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const d = await ttCall<{ list?: T[]; page_info?: PageInfo }>('GET', path, token, { ...params, page, page_size: 1000 });
    out.push(...(d.list ?? []));
    if (!d.page_info?.total_page || page >= d.page_info.total_page) break;
  }
  return out;
}

/** Số tiền TikTok (đơn vị tiền tệ, có thể là chuỗi) → micros. */
export function ttMoneyToMicros(v: string | number | null | undefined): number {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}

/** Micros → đơn vị tiền tệ cho lệnh ghi. VND/JPY/KRW không có phần lẻ. */
export function microsToTtMoney(micros: number, currency: string): number {
  const v = micros / 1_000_000;
  return ['VND', 'JPY', 'KRW', 'IDR', 'CLP', 'TWD', 'HUF'].includes(currency.toUpperCase())
    ? Math.round(v)
    : Math.round(v * 100) / 100;
}

// ─── Tài khoản quảng cáo ─────────────────────────────────────────────────────

export interface TtAdvertiser {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
}

/** Tài khoản quảng cáo mà token được cấp quyền. Cần app_id + secret của app. */
export async function listAuthorizedAdvertisers(
  token: string, appId: string, secret: string,
): Promise<{ id: string; name: string }[]> {
  const d = await ttCall<{ list?: { advertiser_id: string | number; advertiser_name?: string }[] }>(
    'GET', 'oauth2/advertiser/get', token, { app_id: appId, secret },
  );
  return (d.list ?? []).map((a) => ({ id: String(a.advertiser_id), name: a.advertiser_name ?? String(a.advertiser_id) }));
}

/** Tài khoản quảng cáo mà một lần cấp quyền MCP được dùng — không cần app_id/secret. */
export async function listMcpAdvertisers(token: string): Promise<{ id: string; name: string }[]> {
  const d = await ttCall<{ list?: { advertiser_id: string | number; advertiser_name?: string }[] }>(
    'GET', 'oauth2/advertiser/get', { kind: 'mcp', token }, {},
  );
  return (d?.list ?? []).map((a) => ({ id: String(a.advertiser_id), name: a.advertiser_name ?? String(a.advertiser_id) }));
}

export async function advertiserInfo(token: TtAuth, ids: string[]): Promise<TtAdvertiser[]> {
  const out: TtAdvertiser[] = [];
  // advertiser/info nhận tối đa 100 ID mỗi lần.
  for (let i = 0; i < ids.length; i += 100) {
    const d = await ttCall<{ list?: Record<string, unknown>[] }>('GET', 'advertiser/info', token, {
      advertiser_ids: ids.slice(i, i + 100),
      fields: ['advertiser_id', 'name', 'currency', 'timezone', 'display_timezone', 'status'],
    });
    for (const a of d.list ?? []) {
      out.push({
        id: String(a.advertiser_id),
        name: String(a.name ?? a.advertiser_id),
        currency: String(a.currency ?? 'USD'),
        timezone: String(a.display_timezone ?? a.timezone ?? 'UTC'),
        status: String(a.status ?? ''),
      });
    }
  }
  return out;
}

// ─── Chiến dịch ──────────────────────────────────────────────────────────────

export interface TtCampaign {
  id: string;
  name: string;
  objective: string;
  /** ENABLE | DISABLE */
  operationStatus: string;
  secondaryStatus: string;
  budgetMode: string;
  /** micros; null nếu không giới hạn ngân sách. */
  budgetMicros: number | null;
  createTime: string | null;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function toCampaign(c: Raw): TtCampaign {
  const infinite = !c.budget_mode || c.budget_mode === 'BUDGET_MODE_INFINITE';
  return {
    id: String(c.campaign_id),
    name: c.campaign_name ?? `Chiến dịch ${c.campaign_id}`,
    objective: c.objective_type ?? 'UNKNOWN',
    operationStatus: c.operation_status ?? '',
    secondaryStatus: c.secondary_status ?? '',
    budgetMode: c.budget_mode ?? 'BUDGET_MODE_INFINITE',
    budgetMicros: infinite ? null : ttMoneyToMicros(c.budget),
    createTime: c.create_time ?? null,
  };
}

export async function listCampaigns(token: TtAuth, advertiserId: string): Promise<TtCampaign[]> {
  const rows = await ttAll<Raw>('campaign/get', token, {
    advertiser_id: advertiserId,
    fields: ['campaign_id', 'campaign_name', 'objective_type', 'operation_status', 'secondary_status',
      'budget', 'budget_mode', 'create_time'],
  });
  return rows.map(toCampaign);
}

/** Mục tiêu TikTok → ad_objective_t. Loại lạ vào 'unknown' — guard không đụng tới. */
export function mapObjective(o: string): string {
  const t = (o || '').toUpperCase();
  if (t === 'TRAFFIC') return 'traffic';
  if (t === 'REACH' || t === 'RF_REACH') return 'awareness';
  if (t === 'VIDEO_VIEWS' || t === 'RF_VIDEO_VIEW') return 'video_views';
  if (t === 'ENGAGEMENT' || t === 'COMMUNITY_INTERACTION') return 'engagement';
  if (t === 'LEAD_GENERATION') return 'leads';
  if (['WEB_CONVERSIONS', 'CONVERSIONS', 'PRODUCT_SALES', 'SHOP_PURCHASES', 'CATALOG_SALES'].includes(t)) return 'sales';
  return 'unknown';
}

// ─── Báo cáo ─────────────────────────────────────────────────────────────────

export interface TtInsight {
  campaignId: string;
  /** YYYY-MM-DD theo múi giờ tài khoản quảng cáo. */
  date: string;
  spendMicros: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  /** 0–1 */
  ctr: number;
}

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * Số liệu theo ngày × chiến dịch. stat_time_day tối đa 30 ngày mỗi lần gọi —
 * khoảng dài hơn bị cắt thành nhiều đoạn.
 */
export async function fetchInsights(
  token: TtAuth, advertiserId: string, opts: { since: string; until: string },
): Promise<TtInsight[]> {
  const out: TtInsight[] = [];
  for (let start = opts.since; start <= opts.until; start = addDays(start, 30)) {
    const end = addDays(start, 29) < opts.until ? addDays(start, 29) : opts.until;
    const rows = await ttAll<{ dimensions?: Raw; metrics?: Raw }>('report/integrated/get', token, {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id', 'stat_time_day'],
      metrics: ['spend', 'impressions', 'clicks', 'reach', 'conversion'],
      start_date: start,
      end_date: end,
    });
    for (const r of rows) {
      const dim = r.dimensions ?? {}, m = r.metrics ?? {};
      const n = (v: unknown) => { const x = Number.parseFloat(String(v ?? '0')); return Number.isFinite(x) ? x : 0; };
      out.push({
        campaignId: String(dim.campaign_id),
        // v1.3 trả "2026-10-03 00:00:00", v2.0 trả "2026-10-03" — cắt 10 ký tự cho cả hai.
        date: String(dim.stat_time_day ?? '').slice(0, 10),
        spendMicros: ttMoneyToMicros(m.spend),
        impressions: Math.round(n(m.impressions)),
        clicks: Math.round(n(m.clicks)),
        reach: Math.round(n(m.reach)),
        conversions: n(m.conversion),
        // TỰ TÍNH thay vì đọc metric ctr: tài liệu không nói rõ ctr là phần trăm
        // ("1.23") hay tỉ lệ ("0.0123") — đọc sai là lệch 100 lần mà không ai báo.
        ctr: n(m.impressions) > 0 ? n(m.clicks) / n(m.impressions) : 0,
      });
    }
  }
  return out;
}

// ─── Danh tính (kênh TikTok) và bài đăng — cho Đăng nhanh kiểu Spark Ads ─────

export interface TtIdentity {
  id: string;
  type: string;           // TT_USER | BC_AUTH_TT | AUTH_CODE | CUSTOMIZED_USER
  name: string;
  avatar: string | null;
  bcId: string | null;    // identity_authorized_bc_id — bắt buộc gửi kèm với BC_AUTH_TT
  usable: boolean;
}

/**
 * Kênh TikTok dùng được để đẩy bài. CUSTOMIZED_USER là danh tính tự đặt, không
 * có bài đăng — bỏ qua. Không lọc theo loại khi gọi: một lần gọi trả hết.
 */
export async function listIdentities(auth: TtAuth, advertiserId: string): Promise<TtIdentity[]> {
  const d = await ttCall<{ identity_list?: Raw[] }>('GET', 'identity/get', auth, { advertiser_id: advertiserId, page_size: 100 });
  return (d.identity_list ?? [])
    .filter((i) => i.identity_type !== 'CUSTOMIZED_USER')
    .map((i) => ({
      id: String(i.identity_id),
      type: String(i.identity_type),
      name: String(i.display_name ?? i.username ?? i.identity_id),
      avatar: i.profile_image ?? null,
      bcId: i.identity_authorized_bc_id ?? null,
      usable: (i.available_status ?? 'AVAILABLE') === 'AVAILABLE' && i.can_pull_video !== false,
    }));
}

export interface TtPost {
  itemId: string;
  text: string;
  cover: string | null;
  durationSec: number | null;
  status: string;
}

export async function listIdentityPosts(
  auth: TtAuth, advertiserId: string, identity: { id: string; type: string; bcId?: string | null },
  cursor?: number,
): Promise<{ posts: TtPost[]; cursor: number | null }> {
  const d = await ttCall<{ video_list?: Raw[]; cursor?: number; has_more?: boolean }>('GET', 'identity/video/get', auth, {
    advertiser_id: advertiserId,
    identity_id: identity.id,
    identity_type: identity.type,
    ...(identity.bcId ? { identity_authorized_bc_id: identity.bcId } : {}),
    count: 20,
    ...(cursor ? { cursor } : {}),
  });
  return {
    posts: (d.video_list ?? []).map((v) => ({
      itemId: String(v.item_id),
      text: v.text ?? '',
      cover: v.video_info?.poster_url ?? null,
      durationSec: v.video_info?.duration ?? null,
      status: v.status ?? '',
    })),
    cursor: d.has_more ? (d.cursor ?? null) : null,
  };
}
