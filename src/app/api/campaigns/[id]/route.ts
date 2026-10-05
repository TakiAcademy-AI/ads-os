import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { campaignRef, editCampaign, type EditAction } from '@/lib/ads/campaign-detail';

export const runtime = 'nodejs';
export const maxDuration = 60;

const id = z.string().regex(/^\d+$/);
const money = z.number().positive().max(1e12);

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), name: z.string().trim().min(1).max(255) }),
  z.object({ action: z.literal('status'), enabled: z.boolean() }),
  z.object({ action: z.literal('budget'), dailyBudget: money }),
  z.object({ action: z.literal('group_status'), groupId: id, groupKind: z.enum(['adset', 'ad_group', 'asset_group']), groupName: z.string().max(300), enabled: z.boolean() }),
  z.object({ action: z.literal('group_budget'), groupId: id, groupName: z.string().max(300), dailyBudget: money }),
  z.object({ action: z.literal('ad_status'), adId: id, groupId: id, adName: z.string().max(300), enabled: z.boolean() }),
  z.object({ action: z.literal('location_add'), geoIds: z.array(id).min(1).max(50), names: z.array(z.string().max(200)).max(50) }),
  z.object({ action: z.literal('location_remove'), criterionId: id, name: z.string().max(200) }),
  z.object({ action: z.literal('keyword_add'), groupId: id, keywords: z.array(z.object({
    text: z.string().trim().min(1).max(80), matchType: z.enum(['BROAD', 'PHRASE', 'EXACT']),
  })).min(1).max(200) }),
  z.object({ action: z.literal('keyword_status'), groupId: id, criterionId: id, text: z.string().max(80), enabled: z.boolean() }),
  z.object({ action: z.literal('keyword_remove'), groupId: id, criterionId: id, text: z.string().max(80) }),
]);

/** Một chỉnh sửa trên chiến dịch (hoặc nhóm/quảng cáo/từ khoá bên trong nó). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireWriter();
  const { id: campaignId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: `Dữ liệu không hợp lệ${first ? `: ${first.message}` : ''}` }, { status: 400 });
  }

  const ref = await campaignRef(campaignId, user.id);
  if (!ref) return NextResponse.json({ error: 'Không tìm thấy chiến dịch' }, { status: 404 });

  try {
    await editCampaign(ref, parsed.data as EditAction);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 });
  }
}
