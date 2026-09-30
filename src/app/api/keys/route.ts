import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { generateKey } from '@/lib/mcp/auth';

export const runtime = 'nodejs';

const Body = z.object({ name: z.string().min(1).max(80) });

/**
 * Tạo API key cho MCP.
 *
 * Key thô trả về ĐÚNG MỘT LẦN trong response này; database chỉ giữ SHA-256.
 * Trước đây chỉ tạo được bằng cách SSH vào máy chủ chạy scripts/mint-key.ts —
 * với người dùng không phải lập trình viên thì đó là rào chắn tuyệt đối.
 */
export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tên key không hợp lệ' }, { status: 400 });
  }

  // Trần số key còn hiệu lực — key rò rỉ mà không ai để ý thì càng ít càng đỡ.
  const { rows: cnt } = await db.query(
    `SELECT count(*)::int n FROM api_key WHERE owner_id = $1 AND status <> 'revoked'`,
    [user.id],
  );
  if (cnt[0].n >= 10) {
    return NextResponse.json(
      { error: 'Đã có 10 key còn hiệu lực. Thu hồi bớt trước khi tạo thêm.' },
      { status: 409 },
    );
  }

  const { raw, hash, suffix } = generateKey();
  await db.query(
    `INSERT INTO api_key (owner_id, name, key_hash, key_suffix, scopes)
     VALUES ($1, $2, $3, $4, ARRAY['read'])`,
    [user.id, parsed.data.name, hash, suffix],
  );

  return NextResponse.json({ key: raw });
}
