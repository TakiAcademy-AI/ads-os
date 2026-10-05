import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { saveToken } from '@/lib/ads/token';
import { listAdAccounts, describeManagerChildren } from '@/lib/ads/google';
import { developerToken } from '@/lib/ads/google-oauth';
import { parseServiceAccountKey, saAccessToken } from '@/lib/ads/google-sa';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({ key: z.string().min(50).max(20_000) });

/**
 * Kết nối Google Ads bằng khoá service account — không qua popup đăng nhập.
 *
 * Lấy được tài khoản nào là do người dùng đã thêm email service account vào
 * tài khoản Google Ads (hoặc MCC) đó. Danh sách rỗng gần như luôn là chưa thêm.
 */
export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dán nội dung file khoá JSON của service account' }, { status: 400 });
  }

  try {
    const key = parseServiceAccountKey(parsed.data.key);
    const accessToken = await saAccessToken(key);
    const accounts = await listAdAccounts({
      accessToken, developerToken: developerToken() || undefined,
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        error: `Khoá hợp lệ nhưng service account chưa được cấp quyền vào tài khoản Google Ads nào. `
          + `Vào Google Ads → Quản trị → Quyền truy cập và bảo mật → dấu + → thêm email `
          + `${key.client_email} với quyền Tiêu chuẩn, rồi thử lại.`,
        email: key.client_email,
      }, { status: 400 });
    }

    // MCC không chạy quảng cáo trực tiếp — xem ghi chú ở callback OAuth.
    const usable = accounts.filter((a) => !a.isManager);
    if (usable.length === 0) {
      const auth = { accessToken, developerToken: developerToken() || undefined };
      const why = (await Promise.all(accounts.map((m) => describeManagerChildren(auth, m.id))))
        .filter(Boolean).join(' ');
      return NextResponse.json({
        error: `Chỉ thấy ${accounts.length} tài khoản quản lý (MCC), không có tài khoản quảng cáo `
          + `nào đang hoạt động. ${why} Cách sửa: trong MCC vào Tài khoản → dấu + → Liên kết `
          + `tài khoản hiện có và chấp nhận lời mời ở tài khoản quảng cáo; hoặc thêm `
          + `${key.client_email} trực tiếp vào tài khoản quảng cáo (Quản trị → Quyền truy cập `
          + `và bảo mật).`,
      }, { status: 400 });
    }

    // Lưu NGUYÊN chuỗi JSON đã dán (mã hoá) — mỗi lần cần là ký JWT mới từ nó.
    const raw = parsed.data.key.trim();
    for (const a of usable) {
      const { rows } = await db.query(
        `INSERT INTO ad_account
           (owner_id, platform, external_id, name, currency, timezone, status,
            connected_at, login_customer_id, token_source)
         VALUES ($1,'google',$2,$3,$4,$5,'pending',NOW(),$6,'service_account')
         ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
           name = EXCLUDED.name, currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone,
           login_customer_id = EXCLUDED.login_customer_id,
           token_source = 'service_account',
           last_error = NULL, updated_at = NOW()
         RETURNING id`,
        [user.id, a.id, a.name, a.currency, a.timeZone, a.loginCustomerId],
      );
      if (rows[0]) await saveToken(rows[0].id, raw);
    }

    return NextResponse.json({
      accounts: usable.length,
      managers: accounts.length - usable.length,
      email: key.client_email,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 400 },
    );
  }
}
