import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { createConfig } from '@/lib/queries/configs';
import { KINDS, parseParams, type AutomationKind } from '@/lib/configs/schema';

const Body = z.object({
  kind: z.enum(KINDS),
  name: z.string().min(1).max(120),
  adAccountId: z.string().uuid(),
  intervalMinutes: z.number().int().min(5).max(1440),
  params: z.unknown(),
});

export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  // Tài khoản QC phải thuộc về người gọi — không tin adAccountId từ client.
  const { rows } = await db.query(
    `SELECT id FROM ad_account WHERE id = $1 AND owner_id = $2`,
    [parsed.data.adAccountId, user.id],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Tài khoản không tồn tại' }, { status: 404 });

  let params: unknown;
  try {
    params = parseParams(parsed.data.kind as AutomationKind, parsed.data.params);
  } catch {
    return NextResponse.json({ error: 'Tham số cấu hình không hợp lệ' }, { status: 400 });
  }

  try {
    const id = await createConfig({
      ownerId: user.id,
      adAccountId: parsed.data.adAccountId,
      kind: parsed.data.kind as AutomationKind,
      name: parsed.data.name,
      intervalMinutes: parsed.data.intervalMinutes,
      params,
    });
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('duplicate key')
      ? 'Đã có cấu hình cùng tên cho tài khoản này'
      : 'Không tạo được cấu hình';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
