import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { readToken } from '@/lib/ads/token';
import { getTemplate, templateToTargeting } from '@/lib/queries/templates';
import {
  createBoostCampaign, validateBoostCampaign, cleanupPartial, AdCreateError,
} from '@/lib/ads/facebook-create';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({
  adAccountId: z.string().uuid(),
  pageId: z.string().min(1),
  /** Dạng '<page_id>_<post_id>' đúng như Graph API trả về. */
  postId: z.string().min(3),
  campaignName: z.string().min(1).max(100),
  templateId: z.string().uuid(),
  /** true = chỉ kiểm payload, KHÔNG tạo gì. */
  validateOnly: z.boolean().default(false),
});

export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }
  const b = parsed.data;

  // Tài khoản phải thuộc người gọi — không tin id từ client.
  const { rows: acct } = await db.query(
    `SELECT external_id, currency, name FROM ad_account
     WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
    [b.adAccountId, user.id],
  );
  if (!acct[0]) {
    return NextResponse.json({ error: 'Tài khoản quảng cáo không hợp lệ' }, { status: 404 });
  }

  const tpl = await getTemplate(user.id, b.templateId);
  if (!tpl) return NextResponse.json({ error: 'Không tìm thấy mẫu quảng cáo' }, { status: 404 });

  const token = await readToken(b.adAccountId);
  if (!token) return NextResponse.json({ error: 'Không đọc được token' }, { status: 400 });

  const spec = {
    adAccountId: acct[0].external_id as string,
    pageId: b.pageId,
    postId: b.postId,
    campaignName: b.campaignName,
    currency: acct[0].currency as string,
    dailyBudgetMicros: tpl.dailyBudgetMicros,
    targeting: templateToTargeting(tpl),
    objective: tpl.objective,
    pixelId: tpl.pixelId,
    conversionEvent: tpl.conversionEvent,
  };

  // Kiểm trước: Facebook trả lỗi y như thật nhưng không tạo object nào, và
  // không kích hoạt hệ thống chống lạm dụng. Bắt được phần lớn vấn đề thuộc về
  // tài khoản: chưa gắn thẻ, bị khoá quyền tạo quảng cáo, token hỏng.
  if (b.validateOnly) {
    try {
      await validateBoostCampaign(token, spec);
      return NextResponse.json({ ok: true, validated: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Kiểm tra thất bại' }, { status: 422 },
      );
    }
  }

  try {
    const made = await createBoostCampaign(token, spec);

    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, idempotency_key, source, applied_at)
       VALUES ($1,$2,$3,'campaign_create','live','applied',
               'chưa có chiến dịch', $4, $5, $6, 'manual', NOW())
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [
        b.adAccountId, b.postId, b.campaignName,
        `PAUSED · ${Math.round(tpl.dailyBudgetMicros / 1_000_000).toLocaleString('vi-VN')}đ/ngày`
          + ` · chiến dịch ${made.campaignId}`,
        `Tạo tay từ bài ${b.postId}, mẫu "${tpl.name}"`,
        `manual:${b.postId}:${made.campaignId}`,
      ],
    );

    return NextResponse.json({ ok: true, ...made });
  } catch (e) {
    // Chuỗi hỏng giữa chừng để lại rác — dọn đi, đây là thứ mình vừa tạo vài
    // giây trước chứ không phải của người dùng. Phải dọn cả creative: xoá chiến
    // dịch KHÔNG kéo theo creative.
    if (e instanceof AdCreateError) await cleanupPartial(token, e.created);
    const step = e instanceof AdCreateError ? ` (hỏng ở bước ${e.step})` : '';
    const msg = `${e instanceof Error ? e.message : 'Lỗi không rõ'}${step}`;

    // GHI CẢ LẦN THẤT BẠI. Trước đây chỉ ghi khi thành công, nên một lần bấm
    // Tạo bị nền tảng từ chối không để lại dấu vết nào — trong khi đó mới đúng
    // là lúc người dùng cần tra lại "tôi đã định làm gì, và vì sao hỏng".
    //
    // Khoá idempotency kèm dấu thời gian: hai lần thử cùng một bài là hai sự
    // kiện khác nhau, không phải một lần trùng lặp cần chặn.
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, error_message, idempotency_key, source)
       VALUES ($1,$2,$3,'campaign_create','live','failed',
               'chưa có chiến dịch', 'không tạo được', $4, $5, $6, 'manual')
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [
        b.adAccountId, b.postId, b.campaignName,
        `Tạo tay từ bài ${b.postId}, mẫu "${tpl.name}"`,
        msg,
        `manual-fail:${b.postId}:${Date.now()}`,
      ],
    ).catch(() => {});

    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
