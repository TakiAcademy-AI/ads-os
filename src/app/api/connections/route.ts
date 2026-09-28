import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { saveToken } from '@/lib/ads/token';
import { listAdAccounts, FacebookError } from '@/lib/ads/facebook';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Probe = z.object({ token: z.string().min(20) });

/** Kiểm tra token và liệt kê tài khoản QC mà nó truy cập được. */
export async function POST(req: Request) {
  await requireUser();
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
  externalId: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().min(3).max(3),
  timezone: z.string().optional(),
});

/** Lưu tài khoản + token đã mã hoá. */
export async function PUT(req: Request) {
  const user = await requireUser();
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  const d = parsed.data;

  const { rows } = await db.query(
    `INSERT INTO ad_account
       (owner_id, platform, external_id, name, currency, timezone, status, connected_at)
     VALUES ($1,'facebook',$2,$3,$4,$5,'active',NOW())
     ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
       name = EXCLUDED.name, currency = EXCLUDED.currency,
       timezone = EXCLUDED.timezone, status = 'active',
       last_error = NULL, updated_at = NOW()
     RETURNING id`,
    [user.id, d.externalId, d.name, d.currency, d.timezone ?? null],
  );

  const id = rows[0]!.id as string;
  await saveToken(id, d.token);
  return NextResponse.json({ id });
}
