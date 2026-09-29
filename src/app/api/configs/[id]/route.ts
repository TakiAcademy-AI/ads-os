import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/session';
import {
  setConfigStatus, setConfigMode, deleteConfig, updateConfig, getConfig,
} from '@/lib/queries/configs';
import { parseParams } from '@/lib/configs/schema';

// Hai thao tác rời nhau trên cùng một endpoint: đổi trạng thái bật/tắt, hoặc
// đổi chế độ chạy thử/ghi thật. Cố ý không gộp — đổi sang 'live' là cho phép
// tiêu tiền, không nên lẫn vào cùng payload với việc bật/tắt.
const Patch = z.union([
  z.object({ status: z.enum(['active', 'paused']) }),
  z.object({ mode: z.enum(['dry_run', 'live']) }),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 });
  }

  if ('mode' in parsed.data) {
    const r = await setConfigMode(user.id, id, parsed.data.mode);
    if (!r) {
      return NextResponse.json(
        { error: 'Không tìm thấy cấu hình, hoặc loại này không có chế độ chạy thử' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, mode: parsed.data.mode });
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

const Put = z.object({
  name: z.string().min(1).max(120),
  intervalMinutes: z.number().int().min(5).max(1440),
  params: z.unknown(),
});

/**
 * Sửa cấu hình đã tạo.
 *
 * `kind` lấy từ database chứ không nhận từ client: loại quyết định schema nào
 * dùng để kiểm params, nên để client tự khai loại là mở đường ghi params của
 * loại này vào cấu hình loại khác.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const parsed = Put.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  const existing = await getConfig(user.id, id);
  if (!existing) return NextResponse.json({ error: 'Không tìm thấy cấu hình' }, { status: 404 });

  let params: unknown;
  try {
    params = parseParams(existing.kind, parsed.data.params);
  } catch {
    return NextResponse.json({ error: 'Tham số cấu hình không hợp lệ' }, { status: 400 });
  }

  const r = await updateConfig(user.id, id, {
    name: parsed.data.name,
    intervalMinutes: parsed.data.intervalMinutes,
    params,
  });
  if (!r) return NextResponse.json({ error: 'Không tìm thấy cấu hình' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const ok = await deleteConfig(user.id, id);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy cấu hình' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
