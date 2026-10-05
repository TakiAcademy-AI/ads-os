// OAuth2 với Google, cho Google Ads API.
//
// KHÁC HẲN FACEBOOK: Google trả access token sống 1 giờ kèm refresh token sống
// vĩnh viễn. Ta lưu REFRESH token và đổi lấy access token mỗi lần cần. Vì vậy
// kết nối Google không bao giờ "hết hạn sau 60 ngày" như Facebook — trừ khi
// người dùng tự thu hồi quyền.
//
// Refresh token CHỈ được trả về ở lần cấp quyền ĐẦU TIÊN, và chỉ khi gửi kèm
// access_type=offline + prompt=consent. Bỏ sót là nhận được access token sống
// một giờ rồi mất kết nối, mà lỗi lúc đó không hề nhắc tới nguyên nhân.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Quyền duy nhất Google Ads API cần. */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/adwords'] as const;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Đọc cấu hình từ biến môi trường. Null nếu chưa khai đủ.
 *
 * Dùng `||` chứ không phải `??`: biến môi trường rỗng là chuỗi rỗng, không phải
 * undefined, nên `??` sẽ cho chuỗi rỗng lọt qua và lỗi nổ tận lúc gọi Google.
 */
export function googleOauthConfig(origin: string): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI
    || `${origin}/api/connections/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

/**
 * Developer token — KHÔNG CÒN BẮT BUỘC. Google bỏ nó từ 9/9/2026, cấp truy cập
 * giờ gắn với project Google Cloud. Còn khai thì vẫn gửi, để trống cũng được.
 */
export function developerToken(): string {
  return process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
}

export function authUrl(cfg: GoogleOAuthConfig, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  u.searchParams.set('state', state);
  // Hai tham số BẮT BUỘC để nhận được refresh token:
  //   access_type=offline  — xin quyền dùng khi người dùng không có mặt
  //   prompt=consent       — ép hỏi lại, nếu không Google bỏ qua refresh token
  //                          ở những lần cấp quyền sau lần đầu
  u.searchParams.set('access_type', 'offline');
  //   select_account — Chrome đăng nhập nhiều tài khoản thì ép hỏi chọn, không
  //                    thì Google có thể tự lấy nhầm tài khoản không có quyền Ads
  u.searchParams.set('prompt', 'select_account consent');
  u.searchParams.set('include_granted_scopes', 'true');
  return u.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenCall(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(json.error_description || json.error || `Google trả HTTP ${res.status}`);
  }
  return json;
}

/** Đổi code lấy refresh token. Ném lỗi nếu Google không trả refresh token. */
export async function exchangeCode(
  cfg: GoogleOAuthConfig,
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const r = await tokenCall({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });
  if (!r.refresh_token) {
    // Xảy ra khi tài khoản đã cấp quyền cho app này trước đó và ta quên
    // prompt=consent. Báo rõ thay vì lưu access token sống một giờ rồi để
    // kết nối chết lặng lẽ sau đó.
    throw new Error(
      'Google không trả refresh token. Vào myaccount.google.com/permissions gỡ '
      + 'quyền của ứng dụng rồi kết nối lại.',
    );
  }
  return { refreshToken: r.refresh_token, accessToken: r.access_token ?? '' };
}

/**
 * Đổi refresh token lấy access token mới.
 *
 * Gọi ở MỌI lần dùng API. Access token sống 1 giờ; không cache trong tiến trình
 * vì production có thể chạy nhiều instance và cron là tiến trình riêng — cache
 * cục bộ chỉ tạo ra bốn bản sao lệch nhau, không tiết kiệm được gì đáng kể.
 */
export async function accessTokenFrom(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
): Promise<string> {
  const r = await tokenCall({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  });
  if (!r.access_token) throw new Error('Google không trả access token');
  return r.access_token;
}

/** HTML đóng popup, dùng chung kiểu với luồng Facebook. */
export function closePopupHtml(origin: string, payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>Đang đóng…</title>
<body style="font:14px system-ui;padding:24px;color:#444">Đang đóng cửa sổ…
<script>
  try { window.opener && window.opener.postMessage(
    Object.assign({source:'ads-os-google'}, ${json}), ${JSON.stringify(origin)}); } catch (e) {}
  window.close();
</script>`;
}
