import { timingSafeEqual } from 'node:crypto';
import { requireUser, getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { saveToken } from '@/lib/ads/token';
import { listAdAccounts, fbMe } from '@/lib/ads/facebook';
import { fetchPages, savePages } from '@/lib/ads/pages';
import { oauthConfig, exchangeCode, exchangeLongLived, closePopupHtml } from '@/lib/ads/facebook-oauth';

export const runtime = 'nodejs';
export const maxDuration = 60;

function html(origin: string, payload: Record<string, unknown>, status = 200) {
  return new Response(closePopupHtml(origin, payload), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const origin = url.origin;

  // Người dùng bấm Huỷ trong hộp thoại Facebook.
  const denied = url.searchParams.get('error');
  if (denied) {
    return html(origin, { ok: false, error: url.searchParams.get('error_description') ?? denied });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return html(origin, { ok: false, error: 'Thiếu code hoặc state' }, 400);

  // State phải khớp state đã lưu trong phiên — chặn kẻ khác ép kết nối tài
  // khoản của họ vào tài khoản Ads OS của bạn.
  const session = await getSession();
  const expected = session.fbOauthState;
  session.fbOauthState = undefined;
  await session.save();

  if (!expected || !sameState(expected, state)) {
    return html(origin, { ok: false, error: 'State không khớp — thử kết nối lại' }, 400);
  }

  const cfg = oauthConfig(origin);
  if (!cfg) return html(origin, { ok: false, error: 'Chưa cấu hình app Facebook' }, 503);

  try {
    const short = await exchangeCode(cfg, code);
    // Không đổi sang token dài hạn thì kết nối chết sau một hai giờ.
    const long = await exchangeLongLived(cfg, short.token);

    // Ghi lại ai đã cấp quyền — không có id này thì yêu cầu xoá dữ liệu của
    // Facebook không biết phải xoá gì (xem /api/facebook/data-deletion).
    const me = await fbMe(long.token).catch(() => null);

    const accounts = await listAdAccounts(long.token);
    if (accounts.length === 0) {
      return html(origin, { ok: false, error: 'Token hợp lệ nhưng không truy cập được tài khoản quảng cáo nào' });
    }

    // Lưu ở trạng thái 'pending' — người dùng tự chọn tài khoản nào thực sự
    // muốn dùng thay vì bật hết.
    let saved = 0;
    for (const a of accounts) {
      const { rows } = await db.query(
        `INSERT INTO ad_account
           (owner_id, platform, external_id, name, currency, timezone, status, connected_at, fb_user_id)
         VALUES ($1,'facebook',$2,$3,$4,$5,'pending',NOW(),$6)
         ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
           name = EXCLUDED.name, currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone, fb_user_id = EXCLUDED.fb_user_id,
           last_error = NULL, updated_at = NOW()
         RETURNING id`,
        [user.id, a.id, a.name, a.currency, a.timezone_name, me?.id ?? null],
      );
      if (rows[0]) { await saveToken(rows[0].id, long.token); saved++; }
    }

    // Page và token của Page lấy luôn ở đây. Token của Page chỉ xuất hiện trong
    // /me/accounts — không có endpoint nào lấy lại được sau này bằng user token,
    // nên bỏ lỡ lúc này là phải bắt người dùng kết nối lại.
    let pages = 0;
    try {
      pages = await savePages(user.id, await fetchPages(long.token));
    } catch (e) {
      // Thiếu pages_show_list không được làm hỏng cả kết nối — tài khoản quảng
      // cáo vẫn dùng được, chỉ "Tự động chạy ads" là chưa chạy được.
      console.error('[callback] không lấy được Page:', e instanceof Error ? e.message : e);
    }

    return html(origin, { ok: true, accounts: saved, pages, expiresIn: long.expiresIn });
  } catch (e) {
    return html(origin, { ok: false, error: e instanceof Error ? e.message : 'Lỗi không rõ' });
  }
}
