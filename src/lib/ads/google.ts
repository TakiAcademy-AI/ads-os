// Google Ads API — CHỈ ĐỌC.
//
// Lệnh ghi nằm ở google-write.ts, tách riêng như phía Facebook.
//
// BA KHÁC BIỆT QUAN TRỌNG SO VỚI FACEBOOK:
//
// 1. TIỀN ĐÃ LÀ MICROS SẴN. `metrics.cost_micros` là micros của đúng tiền tệ
//    tài khoản — trùng khớp đơn vị nội bộ của hệ thống. KHÔNG được đưa qua
//    spendToMicros: làm vậy là nhân thêm 1.000.000 lần nữa.
//
// 2. CHUYỂN ĐỔI LÀ SỐ THẬP PHÂN, và chỉ có MỘT chỉ số duy nhất
//    (`metrics.conversions`). Không có mớ action_type trùng lặp như Facebook,
//    nên không có bẫy cộng dồn đếm ba lần.
//
// 3. Tài khoản nằm dưới một tài khoản quản lý thì phải kèm login-customer-id.
//
// DEVELOPER TOKEN ĐÃ BỊ BỎ từ 9/9/2026. Cấp truy cập API (Test/Explorer/Basic/
// Standard) giờ gắn với PROJECT GOOGLE CLOUD chứa OAuth client, không gắn với
// token. Header developer-token vẫn được chấp nhận nhưng bị bỏ qua, và sẽ bị
// từ chối ở một bản API lớn sau này — nên chỉ gửi khi .env còn khai.
// https://developers.google.com/google-ads/api/docs/api-policy/developer-token

const HOST = 'https://googleads.googleapis.com';
const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const TIMEOUT_MS = 30_000;
const MAX_RETRY = 3;

export class GoogleAdsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Token hỏng hoặc bị thu hồi — người dùng phải kết nối lại. */
    readonly isAuthProblem = false,
  ) {
    super(message);
    this.name = 'GoogleAdsError';
  }
}

export interface GoogleAuth {
  accessToken: string;
  /** Đã bị Google bỏ — chỉ gửi nếu còn khai trong .env. Xem ghi chú đầu file. */
  developerToken?: string;
  /** ID tài khoản quản lý, chỉ chữ số. Bỏ trống nếu tài khoản đứng độc lập. */
  loginCustomerId?: string | null;
}

function headers(auth: GoogleAuth): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
  };
  if (auth.developerToken) h['developer-token'] = auth.developerToken;
  // Thiếu header này khi tài khoản nằm dưới MCC thì Google trả lỗi quyền, và
  // thông báo lỗi KHÔNG hề nhắc tới header còn thiếu.
  if (auth.loginCustomerId) h['login-customer-id'] = auth.loginCustomerId.replace(/\D/g, '');
  return h;
}


interface GoogleErrorBody {
  message?: string;
  status?: string;
  details?: {
    '@type'?: string;
    reason?: string;
    errors?: { message?: string; errorCode?: Record<string, string> }[];
  }[];
}

/**
 * Bóc thông điệp lỗi có ích ra khỏi vỏ lỗi nhiều tầng của Google.
 *
 * Hai bẫy đã gặp thật:
 *   1. searchStream trả lỗi bọc trong MẢNG — `[{"error": {...}}]` — chứ không
 *      phải object. Đọc thẳng `.error` là ra undefined và người dùng chỉ thấy
 *      "Google Ads trả HTTP 403" trơ trọi.
 *   2. details[0] thường là google.rpc.ErrorInfo, còn GoogleAdsFailure (chứa
 *      errorCode thật) nằm ở phần tử sau — phải dò hết mảng.
 */
export function extractError(body: unknown, status: number): string {
  const wrapped = (Array.isArray(body) ? body[0] : body) as { error?: GoogleErrorBody } | undefined;
  const err = wrapped?.error;
  const details = err?.details ?? [];
  const adsErr = details.flatMap((d) => d.errors ?? [])[0];
  const code = adsErr?.errorCode ? Object.values(adsErr.errorCode)[0] : undefined;
  const reason = details.find((d) => d.reason)?.reason;
  const raw = adsErr?.message || err?.message || `Google Ads trả HTTP ${status}`;

  if (code === 'BUDGET_BELOW_PER_DAY_MINIMUM') {
    const d = (details.flatMap((x) => x.errors ?? [])[0] as {
      details?: { budgetPerDayMinimumErrorDetails?: { budgetPerDayMinimumMicros?: string; currencyCode?: string } };
    } | undefined)?.details?.budgetPerDayMinimumErrorDetails;
    if (d?.budgetPerDayMinimumMicros) {
      const min = Math.ceil(Number(d.budgetPerDayMinimumMicros) / 1_000_000);
      return `Ngân sách thấp hơn mức tối thiểu Google cho phép với loại chiến dịch này: tối `
        + `thiểu ${min.toLocaleString('vi-VN')} ${d.currencyCode ?? ''}/ngày.`;
    }
  }
  const hint = (code && HINTS[code]) || (reason && HINTS[reason]);
  return hint ? `${hint} (${code ?? reason}: ${raw})` : (code ? `${raw} (${code})` : raw);
}

/**
 * Lời giải cho những lỗi hay gặp lúc kết nối. Thông điệp gốc của Google gần
 * như không bao giờ nói phải sửa ở đâu.
 */
const HINTS: Record<string, string> = {
  CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION:
    'Project Google Cloud đang ở cấp truy cập Test, chỉ gọi được tài khoản thử nghiệm. '
    + 'Vào Google Cloud Console → trang Tổng quan Google Ads API của project, đăng ký Explorer hoặc Basic.',
  ACTION_NOT_PERMITTED:
    'Project Google Cloud chưa được phép gọi tài khoản thật (cấp truy cập Test). '
    + 'Đăng ký Explorer hoặc Basic ở trang Tổng quan Google Ads API của project.',
  DEVELOPER_TOKEN_NOT_APPROVED:
    'Project Google Cloud chưa được duyệt cấp truy cập cho tài khoản thật. '
    + 'Đăng ký Explorer hoặc Basic ở trang Tổng quan Google Ads API của project.',
  USER_PERMISSION_DENIED:
    'Tài khoản đăng nhập / service account không có quyền trên tài khoản Google Ads này. '
    + 'Kiểm tra email đã được thêm đúng vào tài khoản (hoặc MCC quản lý nó) trong Quản trị → '
    + 'Quyền truy cập và bảo mật, và lời mời đã được chấp nhận.',
  CUSTOMER_NOT_ENABLED:
    'Tài khoản Google Ads này chưa kích hoạt hoặc đã bị huỷ — chưa nhập thanh toán hay '
    + 'chưa tạo chiến dịch đầu tiên thì Google chưa cho gọi API.',
  SERVICE_DISABLED:
    'Google Ads API chưa được bật trong project Google Cloud. Vào APIs & Services → '
    + 'Library → Google Ads API → Enable, chờ vài phút rồi thử lại.',
  CONVERSION_TRACKING_NOT_ENABLED:
    'Tài khoản chưa bật theo dõi chuyển đổi nên chưa dùng được chiến lược "Tối đa hoá chuyển '
    + 'đổi". Chọn "Tối đa lượt nhấp", hoặc tạo hành động chuyển đổi trong Google Ads (Mục tiêu → '
    + 'Lượt chuyển đổi) và cài thẻ lên website trước.',
  ASPECT_RATIO_NOT_ALLOWED:
    'Ảnh sai tỉ lệ. Ảnh ngang phải 1.91:1 (vd 1200×628), ảnh vuông và logo phải 1:1.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT:
    'Token không có quyền adwords. Kết nối lại.',
};

async function call<T>(
  path: string,
  auth: GoogleAuth,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(`${HOST}/${VERSION}${path}`, {
        method: init.method,
        headers: headers(auth),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) return (await res.json()) as T;

      const body = await res.json().catch(() => ({}));
      const msg = extractError(body, res.status);

      // 401/403 = token hỏng hoặc thiếu quyền; thử lại vô nghĩa.
      if (res.status === 401 || res.status === 403) {
        throw new GoogleAdsError(msg, res.status, true);
      }
      // 4xx khác cũng là lỗi tham số, không phải lỗi tạm thời.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new GoogleAdsError(msg, res.status);
      }
      lastErr = new GoogleAdsError(msg, res.status);
    } catch (e) {
      if (e instanceof GoogleAdsError && e.status !== undefined && e.status < 500 && e.status !== 429) {
        throw e;
      }
      lastErr = e instanceof Error ? e : new Error(String(e));
    }

    if (attempt < MAX_RETRY - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new GoogleAdsError(
    `Gọi Google Ads thất bại sau ${MAX_RETRY} lần: ${lastErr?.message ?? 'không rõ'}`,
  );
}

/**
 * Chạy một câu GAQL và trả về mọi dòng.
 *
 * searchStream trả về MẢNG các khối, mỗi khối có `results` riêng — không phải
 * một mảng phẳng. Quên gộp lại là chỉ đọc được khối đầu tiên và mất phần lớn
 * dữ liệu của tài khoản lớn, một cách lặng lẽ.
 */
export async function gaql<T>(
  auth: GoogleAuth,
  customerId: string,
  query: string,
): Promise<T[]> {
  const cid = customerId.replace(/\D/g, '');
  const chunks = await call<{ results?: T[] }[]>(
    `/customers/${cid}/googleAds:searchStream`,
    auth,
    { method: 'POST', body: { query } },
  );
  return (Array.isArray(chunks) ? chunks : []).flatMap((c) => c.results ?? []);
}

// ─── Tài khoản ───────────────────────────────────────────────────────────────

export interface GoogleAdAccount {
  /** Customer ID, chỉ chữ số. */
  id: string;
  name: string;
  currency: string;
  timeZone: string;
  /** true = đây là tài khoản QUẢN LÝ, không chạy quảng cáo trực tiếp. */
  isManager: boolean;
  /** MCC cha, nếu tài khoản này được tìm thấy qua một MCC. */
  loginCustomerId: string | null;
}

/** Customer ID mà token này truy cập được. Chỉ trả ID, chưa có tên. */
export async function listAccessibleCustomers(auth: GoogleAuth): Promise<string[]> {
  const r = await call<{ resourceNames?: string[] }>(
    '/customers:listAccessibleCustomers', auth, { method: 'GET' },
  );
  return (r.resourceNames ?? []).map((n) => n.split('/').pop() ?? '').filter(Boolean);
}

interface CustomerClientRow {
  customerClient?: {
    id?: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    manager?: boolean;
    status?: string;
  };
}

/**
 * Liệt kê đầy đủ tài khoản, gồm cả tài khoản con nằm dưới mỗi MCC.
 *
 * listAccessibleCustomers chỉ trả về những tài khoản token được gắn TRỰC TIẾP.
 * Người chạy quảng cáo ở Việt Nam thường có một MCC chứa hàng chục tài khoản
 * con — dừng ở listAccessibleCustomers là chỉ thấy đúng cái MCC, tưởng không
 * có tài khoản nào chạy được.
 */
export async function listAdAccounts(auth: GoogleAuth): Promise<GoogleAdAccount[]> {
  const roots = await listAccessibleCustomers(auth);
  const seen = new Map<string, GoogleAdAccount>();
  // Một gốc lỗi thì bỏ qua để vẫn lấy được các gốc khác. Nhưng TẤT CẢ đều lỗi
  // thì phải báo lỗi gốc — nuốt hết thành mảng rỗng là người dùng chỉ thấy
  // "không có tài khoản nào" trong khi nguyên nhân thật là project chưa được
  // duyệt cấp truy cập.
  let firstError: unknown = null;
  let okRoots = 0;

  for (const root of roots) {
    // Truy vấn customer_client từ gốc trả về cả chính nó lẫn toàn bộ cây con.
    const rows = await gaql<CustomerClientRow>(
      { ...auth, loginCustomerId: root },
      root,
      `SELECT customer_client.id, customer_client.descriptive_name,
              customer_client.currency_code, customer_client.time_zone,
              customer_client.manager, customer_client.status
       FROM customer_client
       WHERE customer_client.status = 'ENABLED'`,
    ).then((r) => { okRoots++; return r; }, (e) => {
      firstError ??= e instanceof GoogleAdsError
        ? new GoogleAdsError(`Tài khoản ${root}: ${e.message}`, e.status, e.isAuthProblem)
        : e;
      return [] as CustomerClientRow[];
    });

    for (const r of rows) {
      const c = r.customerClient;
      if (!c?.id) continue;
      // Tài khoản xuất hiện dưới nhiều MCC thì giữ bản đầu tiên — bản nào cũng
      // truy cập được, và đổi qua lại chỉ làm rối người dùng.
      if (seen.has(c.id)) continue;
      seen.set(c.id, {
        id: c.id,
        name: c.descriptiveName || `Tài khoản ${c.id}`,
        currency: c.currencyCode || 'VND',
        timeZone: c.timeZone || 'Asia/Ho_Chi_Minh',
        isManager: c.manager === true,
        loginCustomerId: c.id === root ? null : root,
      });
    }
  }
  if (roots.length > 0 && okRoots === 0 && firstError) throw firstError;
  return [...seen.values()];
}

/**
 * Giải thích vì sao một MCC không có tài khoản con dùng được.
 *
 * listAdAccounts chỉ lấy tài khoản ENABLED. Khi kết quả chỉ còn MCC, người
 * dùng cần biết là MCC TRỐNG hay có con nhưng bị huỷ/tạm ngưng — hai việc phải
 * sửa ở hai chỗ khác nhau. Lời mời liên kết đang chờ chấp nhận thì chưa hiện
 * trong customer_client, nên không đếm được ở đây.
 */
export async function describeManagerChildren(
  auth: GoogleAuth, managerId: string,
): Promise<string> {
  const rows = await gaql<CustomerClientRow>(
    { ...auth, loginCustomerId: managerId },
    managerId,
    `SELECT customer_client.id, customer_client.descriptive_name,
            customer_client.manager, customer_client.status
     FROM customer_client
     WHERE customer_client.level > 0`,
  ).catch(() => null);
  if (!rows) return '';

  const children = rows.map((r) => r.customerClient).filter((c) => c?.id && !c.manager);
  if (children.length === 0) {
    // Lời mời liên kết đang chờ KHÔNG hiện trong customer_client — phải hỏi
    // riêng customer_client_link ở từng MCC trong cây (gốc + MCC con).
    const managers = [managerId, ...rows.map((r) => r.customerClient)
      .filter((c) => c?.id && c.manager).map((c) => c!.id!)];
    const pending: string[] = [];
    for (const m of managers) {
      const links = await gaql<{ customerClientLink?: { clientCustomer?: string; status?: string } }>(
        { ...auth, loginCustomerId: managerId }, m,
        `SELECT customer_client_link.client_customer, customer_client_link.status
         FROM customer_client_link
         WHERE customer_client_link.status = 'PENDING'`,
      ).catch(() => []);
      for (const l of links) {
        const id = l.customerClientLink?.clientCustomer?.split('/').pop();
        if (id) pending.push(`${fmtId(id)} (mời từ ${fmtId(m)})`);
      }
    }
    if (pending.length) {
      return `Có ${pending.length} lời mời liên kết ĐANG CHỜ chấp nhận: ${pending.join(', ')}. `
        + `Đăng nhập tài khoản được mời → Quản trị → Quyền truy cập và bảo mật → tab Người `
        + `quản lý → Chấp nhận.`;
    }
    return `Trong toàn bộ cây dưới MCC ${fmtId(managerId)} không có tài khoản quảng cáo nào, `
      + `và cũng không có lời mời liên kết nào đang chờ.`;
  }
  const byStatus = new Map<string, number>();
  for (const c of children) byStatus.set(c!.status ?? 'UNKNOWN', (byStatus.get(c!.status ?? 'UNKNOWN') ?? 0) + 1);
  const list = [...byStatus].map(([st, n]) => `${n} ${STATUS_VI[st] ?? st}`).join(', ');
  return `MCC ${managerId} có ${children.length} tài khoản con nhưng không cái nào đang `
    + `hoạt động: ${list}.`;
}

function fmtId(id: string): string {
  return id.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
}

const STATUS_VI: Record<string, string> = {
  ENABLED: 'đang hoạt động',
  CANCELED: 'đã huỷ',
  SUSPENDED: 'bị tạm ngưng',
  CLOSED: 'đã đóng',
};

// ─── Chiến dịch ──────────────────────────────────────────────────────────────

export interface GoogleCampaign {
  id: string;
  name: string;
  /** ENABLED | PAUSED | REMOVED */
  status: string;
  /** SEARCH | DISPLAY | VIDEO | SHOPPING | PERFORMANCE_MAX | DEMAND_GEN… */
  channelType: string;
  /** Ngân sách/ngày, micros. null nếu dùng ngân sách chia sẻ không đọc được. */
  dailyBudgetMicros: number | null;
  /** Resource name của ngân sách — cần để ĐỔI ngân sách sau này. */
  budgetResource: string | null;
  startDate: string | null;
}

interface CampaignRow {
  campaign?: {
    id?: string; name?: string; status?: string;
    advertisingChannelType?: string; startDateTime?: string; campaignBudget?: string;
  };
  campaignBudget?: { amountMicros?: string; resourceName?: string };
}

export async function listCampaigns(
  auth: GoogleAuth, customerId: string,
): Promise<GoogleCampaign[]> {
  const rows = await gaql<CampaignRow>(auth, customerId,
    `SELECT campaign.id, campaign.name, campaign.status,
            campaign.advertising_channel_type, campaign.start_date_time,
            campaign_budget.amount_micros, campaign_budget.resource_name
     FROM campaign
     WHERE campaign.status != 'REMOVED'`);

  return rows.filter((r) => r.campaign?.id).map((r) => ({
    id: r.campaign!.id!,
    name: r.campaign!.name || `Chiến dịch ${r.campaign!.id}`,
    status: r.campaign!.status || 'UNKNOWN',
    channelType: r.campaign!.advertisingChannelType || 'UNKNOWN',
    // amount_micros ĐÃ là micros — không nhân thêm gì cả.
    dailyBudgetMicros: r.campaignBudget?.amountMicros
      ? Number(r.campaignBudget.amountMicros) : null,
    budgetResource: r.campaignBudget?.resourceName ?? null,
    // Từ v23 Google bỏ start_date, thay bằng start_date_time dạng
    // "2026-10-05 14:12:40" (giờ của tài khoản). Chỉ cần phần ngày.
    startDate: r.campaign!.startDateTime?.slice(0, 10) ?? null,
  }));
}

// ─── Số liệu theo ngày ───────────────────────────────────────────────────────

export interface GoogleInsight {
  campaignId: string;
  date: string;
  costMicros: number;
  impressions: number;
  clicks: number;
  /** Số thập phân — Google phân bổ chia phần nên 0.5 chuyển đổi là bình thường. */
  conversions: number;
  /** Tỷ lệ 0–1, không phải phần trăm. */
  ctr: number;
}

interface MetricRow {
  campaign?: { id?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string; impressions?: string; clicks?: string;
    conversions?: number; ctr?: number;
  };
}

export async function fetchInsights(
  auth: GoogleAuth,
  customerId: string,
  opts: { since: string; until: string },
): Promise<GoogleInsight[]> {
  // segments.date tách sẵn theo ngày — không cần tham số riêng như
  // time_increment của Facebook. Guard attribution cần số theo từng ngày.
  const rows = await gaql<MetricRow>(auth, customerId,
    `SELECT campaign.id, segments.date,
            metrics.cost_micros, metrics.impressions, metrics.clicks,
            metrics.conversions, metrics.ctr
     FROM campaign
     WHERE segments.date BETWEEN '${opts.since}' AND '${opts.until}'
       AND campaign.status != 'REMOVED'`);

  return rows.filter((r) => r.campaign?.id && r.segments?.date).map((r) => ({
    campaignId: r.campaign!.id!,
    date: r.segments!.date!,
    costMicros: Number(r.metrics?.costMicros ?? 0),
    impressions: Number(r.metrics?.impressions ?? 0),
    clicks: Number(r.metrics?.clicks ?? 0),
    conversions: Number(r.metrics?.conversions ?? 0),
    // Google trả tỷ lệ dạng thập phân (0.05 = 5%). Facebook trả phần trăm (5).
    // Cột ctr của hệ thống lưu dạng thập phân, nên Google dùng thẳng.
    ctr: Number(r.metrics?.ctr ?? 0),
  }));
}

/**
 * Ánh xạ kênh quảng cáo Google sang mục tiêu nội bộ.
 *
 * Đây là phép ÁNH XẠ GẦN ĐÚNG, không phải tương đương. Google phân loại theo
 * nơi quảng cáo hiển thị; hệ thống này phân loại theo thứ muốn đạt được. Chuỗi
 * gốc luôn được giữ ở objective_raw để truy lại khi ánh xạ sai.
 */
export function mapChannelType(channelType: string): string {
  const t = channelType.toUpperCase();
  if (t === 'SEARCH') return 'traffic';
  if (t === 'SHOPPING' || t === 'PERFORMANCE_MAX') return 'sales';
  if (t === 'VIDEO') return 'video_views';
  if (t === 'DISPLAY' || t === 'DEMAND_GEN' || t === 'DISCOVERY') return 'awareness';
  return 'unknown';
}
