import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { updateTemplate, deleteTemplate, templateUsage } from '@/lib/queries/templates';
import { TemplateBody } from '../route';

export const runtime = 'nodejs';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const parsed = TemplateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 },
    );
  }
  const ok = await updateTemplate(user.id, id, parsed.data);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy mẫu' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;

  // Xoá mẫu không làm cấu hình nào chết — chúng quay về tham số khai sẵn — nhưng
  // hành vi ĐỔI, nên phải chặn lại để người dùng biết chứ không xoá lặng lẽ.
  const used = await templateUsage(user.id, id);
  if (used > 0) {
    return NextResponse.json({
      error: `${used} cấu hình Tự động chạy ads đang dùng mẫu này. `
        + `Xoá xong chúng sẽ quay về nhắm đối tượng khai riêng trong từng cấu hình. `
        + `Đổi chúng sang mẫu khác trước nếu không muốn vậy.`,
      usage: used,
    }, { status: 409 });
  }

  const ok = await deleteTemplate(user.id, id);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy mẫu' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
