import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';

const Patch = z.object({ status: z.enum(['active', 'disconnected']) });

/** Bật/ngắt một tài khoản đã kết nối. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireWriter();
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });

  const { rowCount } = await db.query(
    `UPDATE ad_account SET status = $3, updated_at = NOW()
     WHERE id = $2 AND owner_id = $1`,
    [user.id, id, parsed.data.status],
  );
  if (!rowCount) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * Ngắt kết nối và xoá token. Giữ lại số liệu đã kéo về.
 *
 * Đặt lại token_source về 'oauth': hết token tay thì lần đăng nhập Facebook
 * sau được phép ghi token vào. Đây là đường duy nhất để bỏ token tay.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireWriter();
  const { id } = await ctx.params;
  const { rowCount } = await db.query(
    `UPDATE ad_account
     SET encrypted_token = NULL, token_source = 'oauth', status = 'disconnected', updated_at = NOW()
     WHERE id = $2 AND owner_id = $1`,
    [user.id, id],
  );
  if (!rowCount) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
