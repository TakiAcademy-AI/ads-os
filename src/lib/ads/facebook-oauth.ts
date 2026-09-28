// Facebook Login for Business — luồng OAuth qua popup.
//
// Khác gì với dán token tay: người dùng cuối chỉ bấm và duyệt, không phải tự
// tạo System User rồi sinh token. Nhưng KHÔNG bỏ được bước đăng ký app —
// vẫn cần App ID + App Secret, chỉ là làm một lần cho cả sản phẩm.
//
// Phạm vi quyền: chỉ xin ads_read. Muốn tắt/bật chiến dịch thật thì phải xin
// thêm ads_management, và với tài khoản của người khác thì cần App Review.

const GRAPH = 'https://graph.facebook.com';
const DIALOG = 'https://www.facebook.com';
const VERSION = process.env.FB_API_VERSION ?? 'v23.0';

/** Chỉ xin quyền đọc. Thêm scope là mở rộng thứ token làm được — cân nhắc kỹ. */
export const SCOPES = ['ads_read', 'business_management'] as const;

export interface OAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/** null nếu chưa cấu hình app — giao diện dựa vào đây để báo thay vì vỡ. */
export function oauthConfig(origin: string): OAuthConfig | null {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret) return null;
  // Cho phép ép cứng qua env khi chạy sau proxy; mặc định suy từ origin của
  // request để dev và production không phải sửa code.
  const redirectUri = process.env.FB_REDIRECT_URI ?? `${origin}/api/connections/facebook/callback`;
  return { appId, appSecret, redirectUri };
}

export function authorizeUrl(cfg: OAuthConfig, state: string): string {
  const u = new URL(`${DIALOG}/${VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', cfg.appId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(','));
  return u.toString();
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string; code?: number };
}

async function tokenRequest(params: Record<string, string>): Promise<{ token: string; expiresIn: number }> {
  const u = new URL(`${GRAPH}/${VERSION}/oauth/access_token`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !body.access_token) {
    throw new Error(body.error?.message ?? `Đổi token thất bại (HTTP ${res.status})`);
  }
  return { token: body.access_token, expiresIn: body.expires_in ?? 0 };
}

/** Đổi `code` từ callback lấy token ngắn hạn (~1-2 giờ). */
export function exchangeCode(cfg: OAuthConfig, code: string) {
  return tokenRequest({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
}

/**
 * Đổi token ngắn hạn lấy token dài hạn (~60 ngày).
 *
 * Bắt buộc làm, nếu không thì kết nối chết sau một hai giờ. Hết 60 ngày vẫn
 * phải nối lại — muốn không bao giờ hết hạn thì dùng System User token
 * (luồng dán tay).
 */
export function exchangeLongLived(cfg: OAuthConfig, shortToken: string) {
  return tokenRequest({
    grant_type: 'fb_exchange_token',
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    fb_exchange_token: shortToken,
  });
}

/**
 * Trang HTML nhỏ đóng popup và báo về cửa sổ cha.
 *
 * targetOrigin đặt đúng origin của app, không dùng '*' — nếu không, bất kỳ
 * trang nào mở popup này cũng đọc được kết quả.
 */
export function closePopupHtml(origin: string, payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Đang xử lý…</title></head>
<body style="font:14px system-ui;padding:28px;color:#1a1a2e">
<p>${payload.ok ? 'Kết nối xong. Đang đóng cửa sổ…' : 'Kết nối thất bại. Có thể đóng cửa sổ này.'}</p>
<script>
  try { window.opener && window.opener.postMessage(${json}, ${JSON.stringify(origin)}); } catch (e) {}
  setTimeout(function(){ window.close(); }, ${payload.ok ? 400 : 2500});
</script></body></html>`;
}
