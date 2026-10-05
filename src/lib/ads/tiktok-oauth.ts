// OAuth cho TikTok API for Business — cấp quyền tài khoản quảng cáo (advertiser).
//
// Luồng: người dùng mở link cấp quyền → TikTok chuyển về redirect URL kèm
// auth_code (sống tối đa 1 giờ, có chỗ trong tài liệu ghi 10 phút, dùng MỘT lần)
// → đổi lấy access token.
//
// Token DÀI HẠN (is_long_term mặc định true): KHÔNG hết hạn, chỉ mất hiệu lực
// khi người dùng thu hồi quyền ở ads.tiktok.com. Không cần refresh như Google.

import { ttCall } from './tiktok';

export interface TikTokOAuthConfig {
  appId: string;
  secret: string;
  redirectUri: string;
}

/** Null nếu chưa khai đủ. `||` chứ không `??` — biến môi trường rỗng là chuỗi rỗng. */
export function tiktokOauthConfig(origin: string): TikTokOAuthConfig | null {
  const appId = process.env.TIKTOK_APP_ID || '';
  const secret = process.env.TIKTOK_APP_SECRET || '';
  if (!appId || !secret) return null;
  return {
    appId,
    secret,
    redirectUri: process.env.TIKTOK_REDIRECT_URI || `${origin}/api/connections/tiktok/callback`,
  };
}

/**
 * Link cấp quyền. Tài liệu chỉ bảo chép "Advertiser authorization URL" trong
 * trang chi tiết app — không công bố định dạng. Dùng định dạng phổ biến; nếu
 * app của bạn dùng link khác, đặt TIKTOK_AUTH_URL (giữ nguyên tham số state
 * và redirect_uri, Ads OS sẽ ghi đè state).
 */
export function tiktokAuthUrl(cfg: TikTokOAuthConfig, state: string): string {
  const custom = process.env.TIKTOK_AUTH_URL;
  const u = new URL(custom || 'https://business-api.tiktok.com/portal/auth');
  u.searchParams.set('app_id', cfg.appId);
  u.searchParams.set('state', state);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  return u.toString();
}

/** Đổi auth_code lấy token dài hạn kèm danh sách tài khoản quảng cáo được cấp. */
export async function exchangeAuthCode(
  cfg: TikTokOAuthConfig, authCode: string,
): Promise<{ accessToken: string; advertiserIds: string[] }> {
  const d = await ttCall<{ access_token?: string; advertiser_ids?: (string | number)[] }>(
    'POST', 'oauth2/access_token', null,
    { app_id: cfg.appId, secret: cfg.secret, auth_code: authCode },
  );
  if (!d?.access_token) throw new Error('TikTok không trả access token');
  return { accessToken: d.access_token, advertiserIds: (d.advertiser_ids ?? []).map(String) };
}

/** HTML đóng popup, cùng kiểu với Facebook/Google. */
export function closePopupHtml(origin: string, payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>Đang đóng…</title>
<body style="font:14px system-ui;padding:24px;color:#444">Đang đóng cửa sổ…
<script>
  try { window.opener && window.opener.postMessage(
    Object.assign({source:'ads-os-tiktok'}, ${json}), ${JSON.stringify(origin)}); } catch (e) {}
  window.close();
</script>`;
}
