import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { syncAccount } from '@/lib/ads/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  adAccountId: z.string().uuid(),
  lookbackDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });

  // Tài khoản phải thuộc về người gọi — không tin id từ client.
  const { rows } = await db.query(
    `SELECT id FROM ad_account WHERE id = $1 AND owner_id = $2`,
    [parsed.data.adAccountId, user.id],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });

  // Chỉ cấu hình ĐANG BẬT mới quyết định tham số. Cấu hình nháp hoặc đã tạm
  // dừng mà vẫn có tác dụng thì người dùng không cách nào biết vì sao số ra khác.
  const { rows: cfg } = await db.query(
    `SELECT params FROM automation_config
     WHERE ad_account_id = $1 AND kind = 'metric_sync' AND status = 'active'
     ORDER BY updated_at DESC LIMIT 1`,
    [parsed.data.adAccountId],
  );
  const p = (cfg[0]?.params ?? {}) as Record<string, unknown>;

  const result = await syncAccount(parsed.data.adAccountId, {
    lookbackDays: parsed.data.lookbackDays ?? (typeof p.lookbackDays === 'number' ? p.lookbackDays : 30),
    level: (p.level as 'campaign' | 'adset' | 'ad') ?? 'campaign',
    extraFields: Array.isArray(p.extraFields) ? (p.extraFields as string[]) : [],
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
