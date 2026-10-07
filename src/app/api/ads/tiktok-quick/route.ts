import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { getTikTokAuth } from '@/lib/ads/tiktok-token';
import { createSparkCampaign, TtCreateError } from '@/lib/ads/tiktok-create';
import { checkTtSpec, TT_OBJECTIVES, type TtQuickSpec } from '@/lib/ads/tiktok-create-spec';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({
  adAccountId: z.string().uuid(),
  objective: z.enum(['VIDEO_VIEWS', 'REACH', 'TRAFFIC', 'ENGAGEMENT']),
  campaignName: z.string().trim().min(1).max(512),
  dailyBudget: z.number().positive().max(1e11),
  identity: z.object({ id: z.string().min(1).max(100), type: z.enum(['TT_USER', 'BC_AUTH_TT', 'AUTH_CODE']), bcId: z.string().max(40).nullable().optional() }),
  itemId: z.string().regex(/^\d+$/),
  locationIds: z.array(z.string().regex(/^\d+$/)).min(1).max(100),
  ageGroups: z.array(z.enum(['AGE_13_17', 'AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100'])).min(1),
  gender: z.enum(['GENDER_UNLIMITED', 'GENDER_MALE', 'GENDER_FEMALE']),
  landingPageUrl: z.string().max(2000).optional(),
  callToAction: z.string().regex(/^[A-Z_]+$/).max(40).optional(),
});

export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return NextResponse.json({ error: `Dữ liệu không hợp lệ${f ? `: ${f.path.join('.')} — ${f.message}` : ''}` }, { status: 400 });
  }
  const b = parsed.data;

  const { rows: acct } = await db.query(
    `SELECT id, external_id, currency FROM ad_account
     WHERE id = $1 AND owner_id = $2 AND platform = 'tiktok' AND status = 'active'`,
    [b.adAccountId, user.id],
  );
  if (!acct[0]) return NextResponse.json({ error: 'Tài khoản TikTok không hợp lệ' }, { status: 404 });
  const currency = acct[0].currency as string;

  const spec: TtQuickSpec = {
    ...b,
    // Không có link thì không gửi nút kêu gọi.
    landingPageUrl: b.landingPageUrl?.trim() || undefined,
    callToAction: b.landingPageUrl?.trim() ? b.callToAction : undefined,
    // VND không có phần lẻ — TikTok từ chối "invalid precision".
    dailyBudget: currency === 'VND' ? Math.round(b.dailyBudget) : Math.round(b.dailyBudget * 100) / 100,
  };
  const errs = checkTtSpec(spec, currency);
  if (errs.length) return NextResponse.json({ error: errs.join('. ') }, { status: 400 });

  const label = TT_OBJECTIVES.find((o) => o.id === b.objective)?.label ?? b.objective;
  const budgetText = `${spec.dailyBudget.toLocaleString('vi-VN')}${currency === 'VND' ? 'đ' : ` ${currency}`}/ngày`;
  const reason = `Đăng nhanh TikTok — đẩy bài ${b.itemId} của kênh, mục tiêu ${label}`;

  let made;
  try {
    made = await createSparkCampaign(await getTikTokAuth(b.adAccountId), acct[0].external_id, spec);
  } catch (e) {
    const step = e instanceof TtCreateError ? ` (hỏng ở bước tạo ${e.step}` + (e.cleanedUp === true ? ' — đã xoá chiến dịch vừa tạo dở' : e.cleanedUp === false ? ' — CHƯA xoá được chiến dịch vừa tạo dở, kiểm tra trong TikTok Ads Manager' : '') + ')' : '';
    const msg = `${e instanceof Error ? e.message : 'Lỗi không rõ'}${step}`;
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, error_message, idempotency_key, source)
       VALUES ($1,$2,$3,'campaign_create','live','failed','chưa có chiến dịch','không tạo được',$4,$5,$6,'manual')
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [b.adAccountId, b.itemId, b.campaignName, reason, msg, `manual-tiktok-fail:${Date.now()}`],
    ).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Đã tạo trên TikTok — lỗi ghi nhật ký không được biến thành "thất bại" (bấm lại = tạo trùng).
  try {
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, idempotency_key, source, applied_at)
       VALUES ($1,$2,$3,'campaign_create','live','applied','chưa có chiến dịch',$4,$5,$6,'manual',NOW())
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [b.adAccountId, made.campaignId, b.campaignName,
       `TẠM DỪNG · ${budgetText} · chiến dịch ${made.campaignId}`, reason, `manual-tiktok:${made.campaignId}`],
    );
  } catch (e) {
    console.error('[tiktok-quick] đã tạo nhưng không ghi được nhật ký:', e);
  }
  return NextResponse.json({ ok: true, ...made });
}
