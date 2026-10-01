import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { saveToken } from '@/lib/ads/token';
import { listAdAccounts, FacebookError } from '@/lib/ads/facebook';
import { fetchPages, savePages } from '@/lib/ads/pages';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Probe = z.object({ token: z.string().min(20) });

/** Kiểm tra token và liệt kê tài khoản QC mà nó truy cập được. */
export async function POST(req: Request) {
  await requireWriter();
  const parsed = Probe.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Thiếu token' }, { status: 400 });

  try {
    const accounts = await listAdAccounts(parsed.data.token);
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        externalId: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone_name,
        active: a.account_status === 1,
      })),
    });
  } catch (e) {
    const msg = e instanceof FacebookError
      ? (e.isTokenProblem ? `Token không dùng được: ${e.message}` : e.message)
      : e instanceof Error ? e.message : 'Lỗi không rõ';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

const Save = z.object({
  token: z.string().min(20),
  externalIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * Lưu token dán tay làm token CHÍNH cho các tài khoản đã chọn.
 *
 * token_source = 'manual' nên đăng nhập Facebook về sau không ghi đè nó — xem
 * migration 013. Tên, tiền tệ, múi giờ lấy lại từ Facebook bằng chính token này
 * chứ không tin client: tài khoản nào token không truy cập được thì không lưu.
 */
export async function PUT(req: Request) {
  const user = await requireWriter();
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  const { token, externalIds } = parsed.data;

  let reachable;
  try {
    reachable = await listAdAccounts(token);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `Token không dùng được: ${e.message}` : 'Token không dùng được' },
      { status: 400 },
    );
  }
  const wanted = new Set(externalIds);
  const accounts = reachable.filter((a) => wanted.has(a.id));
  if (accounts.length === 0) {
    return NextResponse.json({ error: 'Token không truy cập được tài khoản nào đã chọn' }, { status: 400 });
  }

  for (const a of accounts) {
    const { rows } = await db.query(
      `INSERT INTO ad_account
         (owner_id, platform, external_id, name, currency, timezone, status, connected_at, token_source)
       VALUES ($1,'facebook',$2,$3,$4,$5,'active',NOW(),'manual')
       ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
         name = EXCLUDED.name, currency = EXCLUDED.currency,
         timezone = EXCLUDED.timezone, status = 'active', token_source = 'manual',
         last_error = NULL, updated_at = NOW()
       RETURNING id`,
      [user.id, a.id, a.name, a.currency, a.timezone_name ?? null],
    );
    await saveToken(rows[0]!.id as string, token);
  }

  // Page lấy bằng chính token này — không có page token thì không chọn được bài
  // để đăng quảng cáo. Thiếu quyền pages_show_list thì Facebook trả mảng rỗng
  // chứ không báo lỗi; không làm hỏng việc lưu tài khoản, chỉ báo ra.
  let pages = 0;
  let pagesError: string | null = null;
  try {
    pages = await savePages(user.id, await fetchPages(token));
  } catch (e) {
    pagesError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    saved: accounts.length,
    skipped: externalIds.length - accounts.length,
    pages,
    pagesError,
  });
}
