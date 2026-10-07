import { timingSafeEqual } from 'node:crypto';
import { requireWriter, getSession } from '@/lib/session';
import { publicOrigin } from '@/lib/public-origin';
import { tiktokOauthConfig, exchangeAuthCode, closePopupHtml } from '@/lib/ads/tiktok-oauth';
import { listAuthorizedAdvertisers } from '@/lib/ads/tiktok';
import { saveTikTokAccounts } from '@/lib/ads/tiktok-connect';

export const runtime = 'nodejs';
export const maxDuration = 60;

function html(origin: string, payload: Record<string, unknown>, status = 200) {
  return new Response(closePopupHtml(origin, payload), { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(req: Request) {
  const user = await requireWriter();
  const url = new URL(req.url);
  // Địa chỉ CÔNG KHAI — dùng làm targetOrigin của postMessage (xem route Google).
  const origin = publicOrigin(req);

  // TikTok gửi cả auth_code lẫn code; tài liệu dùng auth_code.
  const code = url.searchParams.get('auth_code') ?? url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return html(origin, { ok: false, error: 'TikTok không trả mã cấp quyền — có thể bạn đã huỷ, hoặc redirect URL của app không khớp.' }, 400);
  }

  // State chống người khác ép kết nối tài khoản của họ vào Ads OS của bạn.
  const session = await getSession();
  const expected = session.tiktokOauthState;
  session.tiktokOauthState = undefined;
  await session.save();
  if (!expected || !same(expected, state)) {
    return html(origin, { ok: false, error: 'State không khớp — thử kết nối lại' }, 400);
  }

  const cfg = tiktokOauthConfig(origin);
  if (!cfg) return html(origin, { ok: false, error: 'Chưa cấu hình app TikTok' }, 503);

  try {
    const { accessToken, advertiserIds } = await exchangeAuthCode(cfg, code);
    // Phòng khi response không kèm danh sách: hỏi lại bằng chính token.
    const ids = advertiserIds.length
      ? advertiserIds
      : (await listAuthorizedAdvertisers(accessToken, cfg.appId, cfg.secret)).map((a) => a.id);
    if (!ids.length) {
      return html(origin, { ok: false, error: 'Token hợp lệ nhưng không có tài khoản quảng cáo nào được cấp quyền. Khi cấp quyền nhớ tick chọn tài khoản quảng cáo.' });
    }
    const r = await saveTikTokAccounts(user.id, accessToken, ids, 'oauth', accessToken);
    return html(origin, { ok: true, accounts: r.saved + r.keptManual, keptManual: r.keptManual });
  } catch (e) {
    return html(origin, { ok: false, error: e instanceof Error ? e.message : 'Lỗi không rõ' });
  }
}
