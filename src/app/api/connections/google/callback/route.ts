import { timingSafeEqual } from 'node:crypto';
import { requireWriter, getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { saveToken } from '@/lib/ads/token';
import { listAdAccounts } from '@/lib/ads/google';
import {
  googleOauthConfig, developerToken, exchangeCode, accessTokenFrom, closePopupHtml,
} from '@/lib/ads/google-oauth';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  // GET nhưng CÓ tác dụng phụ — xem ghi chú ở route start.
  const user = await requireWriter();
  const url = new URL(req.url);
  const origin = url.origin;

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
  const expected = session.googleOauthState;
  session.googleOauthState = undefined;
  await session.save();

  if (!expected || !sameState(expected, state)) {
    return html(origin, { ok: false, error: 'State không khớp — thử kết nối lại' }, 400);
  }

  const cfg = googleOauthConfig(origin);
  if (!cfg) return html(origin, { ok: false, error: 'Chưa cấu hình app Google' }, 503);
  const devToken = developerToken();
  if (!devToken) return html(origin, { ok: false, error: 'Thiếu GOOGLE_ADS_DEVELOPER_TOKEN' }, 503);

  try {
    // exchangeCode ném lỗi nếu Google không trả refresh token — đó là hỏng
    // thật, không phải chuyện bỏ qua được: access token sống một giờ rồi kết
    // nối chết lặng lẽ.
    const { refreshToken } = await exchangeCode(cfg, code);
    const accessToken = await accessTokenFrom(cfg, refreshToken);

    const accounts = await listAdAccounts({
      accessToken, developerToken: devToken,
    });
    if (accounts.length === 0) {
      return html(origin, {
        ok: false,
        error: 'Token hợp lệ nhưng không truy cập được tài khoản Google Ads nào. '
          + 'Kiểm tra tài khoản Google vừa đăng nhập có quyền trên tài khoản quảng cáo không.',
      });
    }

    // Tài khoản QUẢN LÝ (MCC) không chạy quảng cáo trực tiếp — lưu vào cũng
    // không đồng bộ được gì, chỉ làm rối danh sách.
    const usable = accounts.filter((a) => !a.isManager);
    if (usable.length === 0) {
      return html(origin, {
        ok: false,
        error: `Chỉ tìm thấy ${accounts.length} tài khoản quản lý (MCC), không có tài khoản `
          + `quảng cáo nào chạy trực tiếp.`,
      });
    }

    let saved = 0;
    for (const a of usable) {
      const { rows } = await db.query(
        `INSERT INTO ad_account
           (owner_id, platform, external_id, name, currency, timezone, status,
            connected_at, login_customer_id)
         VALUES ($1,'google',$2,$3,$4,$5,'pending',NOW(),$6)
         ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
           name = EXCLUDED.name, currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone,
           login_customer_id = EXCLUDED.login_customer_id,
           last_error = NULL, updated_at = NOW()
         RETURNING id`,
        [user.id, a.id, a.name, a.currency, a.timeZone, a.loginCustomerId],
      );
      // Lưu REFRESH token, không phải access token — access token sống 1 giờ.
      if (rows[0]) { await saveToken(rows[0].id, refreshToken); saved++; }
    }

    return html(origin, {
      ok: true,
      accounts: saved,
      managers: accounts.length - usable.length,
    });
  } catch (e) {
    return html(origin, { ok: false, error: e instanceof Error ? e.message : 'Lỗi không rõ' });
  }
}
