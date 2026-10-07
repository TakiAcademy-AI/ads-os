import { timingSafeEqual } from 'node:crypto';
import { requireWriter, getSession } from '@/lib/session';
import { publicOrigin } from '@/lib/public-origin';
import { exchangeCode } from '@/lib/ads/tiktok-mcp';
import { closePopupHtml } from '@/lib/ads/tiktok-oauth';
import { listMcpAdvertisers } from '@/lib/ads/tiktok';
import { saveTikTokAccounts } from '@/lib/ads/tiktok-connect';

export const runtime = 'nodejs';
export const maxDuration = 60;

function html(origin: string, payload: Record<string, unknown>, status = 200) {
  return new Response(closePopupHtml(origin, payload), { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: Request) {
  const user = await requireWriter();
  const url = new URL(req.url);
  const origin = publicOrigin(req);

  const session = await getSession();
  const pending = session.tiktokMcp;
  session.tiktokMcp = undefined;
  await session.save();

  const err = url.searchParams.get('error');
  if (err) return html(origin, { ok: false, error: url.searchParams.get('error_description') ?? `TikTok từ chối: ${err}` });
  const code = url.searchParams.get('code');
  if (!code) return html(origin, { ok: false, error: 'TikTok không trả mã cấp quyền — có thể bạn đã huỷ.' }, 400);
  if (!pending) return html(origin, { ok: false, error: 'Phiên kết nối đã hết — bấm kết nối lại.' }, 400);

  // Tài liệu không hứa trả lại state; nếu CÓ thì phải khớp. Bảo vệ chính là
  // PKCE: verifier nằm trong phiên của chính người này.
  const state = url.searchParams.get('state');
  if (state) {
    const a = Buffer.from(state), b = Buffer.from(pending.state);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return html(origin, { ok: false, error: 'State không khớp — thử kết nối lại' }, 400);
    }
  }

  try {
    const tokens = await exchangeCode(code, pending.verifier, pending.redirectUri);
    const advertisers = await listMcpAdvertisers(tokens.access_token);
    if (!advertisers.length) {
      return html(origin, { ok: false, error: 'Đã cấp quyền nhưng tài khoản TikTok for Business này không có tài khoản quảng cáo nào.' });
    }
    const r = await saveTikTokAccounts(
      user.id, { kind: 'mcp', token: tokens.access_token }, advertisers.map((a) => a.id),
      'mcp', JSON.stringify(tokens), tokens.refresh_expires_at,
    );
    return html(origin, { ok: true, accounts: r.saved + r.keptManual, keptManual: r.keptManual });
  } catch (e) {
    return html(origin, { ok: false, error: e instanceof Error ? e.message : 'Lỗi không rõ' });
  }
}
