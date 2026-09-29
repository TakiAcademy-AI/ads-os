import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, getSession } from '@/lib/session';
import { db } from '@/lib/db';

const Body = z.object({ accountId: z.string().uuid() });

/** Đổi tài khoản QC đang xem. */
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Thiếu accountId' }, { status: 400 });

  // Không tin id từ client — phải thuộc về người gọi và đang bật.
  const { rows } = await db.query(
    `SELECT id FROM ad_account WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
    [parsed.data.accountId, user.id],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });

  const session = await getSession();
  session.accountId = parsed.data.accountId;
  await session.save();
  return NextResponse.json({ ok: true });
}
