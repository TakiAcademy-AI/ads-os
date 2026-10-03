import { requireWriter } from '@/lib/session';
import { deletePages } from '@/lib/ads/pages';

export const runtime = 'nodejs';

/** Gỡ một Page khỏi hệ thống, xoá luôn page token. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ pageId: string }> }) {
  const user = await requireWriter();
  const { pageId } = await ctx.params;
  const removed = await deletePages(user.id, [pageId]);
  if (!removed) return Response.json({ error: 'Không tìm thấy Page' }, { status: 404 });
  return Response.json({ ok: true });
}
