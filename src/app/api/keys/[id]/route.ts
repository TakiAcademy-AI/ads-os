import { NextResponse } from 'next/server';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Thu hồi API key.
 *
 * Đánh dấu status='revoked' chứ KHÔNG xoá dòng: nhật ký mcp_request_log trỏ tới
 * api_key qua khoá ngoại, xoá đi là mất luôn dấu vết ai đã gọi gì. Key bị thu
 * hồi không đăng nhập lại được, đó mới là điều quan trọng.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireWriter();
  const { id } = await ctx.params;

  const { rowCount } = await db.query(
    `UPDATE api_key SET status = 'revoked', revoked_at = NOW()
     WHERE id = $2 AND owner_id = $1 AND status <> 'revoked'`,
    [user.id, id],
  );
  if ((rowCount ?? 0) === 0) {
    return NextResponse.json(
      { error: 'Không tìm thấy key, hoặc key đã bị thu hồi' }, { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
