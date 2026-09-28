import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { setConfigStatus, deleteConfig } from '@/lib/queries/configs';

const Patch = z.object({ status: z.enum(['active', 'paused']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
  }

  try {
    const ok = await setConfigStatus(user.id, id, parsed.data.status);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy cấu hình' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Chỉ một auto_pause được active mỗi tài khoản (unique index ở migration 003).
    const msg = e instanceof Error && e.message.includes('automation_config_one_active_pause')
      ? 'Tài khoản này đã có một cấu hình tắt ads đang chạy. Tạm dừng cái cũ trước.'
      : 'Không đổi được trạng thái';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const ok = await deleteConfig(user.id, id);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy cấu hình' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
