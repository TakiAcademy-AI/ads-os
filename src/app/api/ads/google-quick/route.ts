import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { db } from '@/lib/db';
import { googleSession, GoogleSetupError } from '@/lib/ads/google-session';
import { createGoogleCampaign, checkSpec, type GoogleCreateSpec } from '@/lib/ads/google-create';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Ảnh đã được cắt và nén ở trình duyệt (~200–400KB/ảnh). Chặn ở 4MB/ảnh để một
// file gốc chưa nén không làm nghẽn request — nginx còn chặn 10MB cả request.
const Image = z.string().min(100).max(4 * 1024 * 1024 * 4 / 3);

const Body = z.object({
  adAccountId: z.string().uuid(),
  kind: z.enum(['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX', 'DEMAND_GEN']),
  name: z.string().trim().min(1).max(255),
  /** Đơn vị tiền của tài khoản (VND), KHÔNG phải micros — đổi ở server. */
  dailyBudget: z.number().positive().max(1e12),
  bidding: z.enum(['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS']),
  targetCpa: z.number().positive().max(1e12).nullable().optional(),
  geoTargets: z.array(z.string().regex(/^\d+$/)).min(1).max(50),
  languages: z.array(z.string().regex(/^\d+$/)).max(10),
  finalUrl: z.string().url(),
  headlines: z.array(z.string()).max(15),
  longHeadlines: z.array(z.string()).max(5).optional(),
  descriptions: z.array(z.string()).max(5),
  businessName: z.string().max(25).optional(),
  path1: z.string().max(15).optional(),
  path2: z.string().max(15).optional(),
  keywords: z.array(z.object({
    text: z.string().min(1).max(80),
    matchType: z.enum(['BROAD', 'PHRASE', 'EXACT']),
  })).max(200).optional(),
  images: z.object({
    landscape: z.array(Image).max(5),
    square: z.array(Image).max(5),
    logo: z.array(Image).max(5),
  }).optional(),
  /** true = Google kiểm toàn bộ y như thật nhưng KHÔNG tạo gì. */
  validateOnly: z.boolean().default(false),
});

const KIND_VI: Record<string, string> = {
  SEARCH: 'Tìm kiếm', DISPLAY: 'Hiển thị', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen',
};

export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: `Dữ liệu không hợp lệ${first ? `: ${first.path.join('.')} — ${first.message}` : ''}` },
      { status: 400 },
    );
  }
  const b = parsed.data;

  // Tài khoản phải thuộc người gọi và là Google — không tin id từ client.
  const { rows: acct } = await db.query(
    `SELECT id, name, currency FROM ad_account
     WHERE id = $1 AND owner_id = $2 AND platform = 'google' AND status = 'active'`,
    [b.adAccountId, user.id],
  );
  if (!acct[0]) {
    return NextResponse.json({ error: 'Tài khoản Google Ads không hợp lệ' }, { status: 404 });
  }

  const spec: GoogleCreateSpec = {
    kind: b.kind,
    name: b.name,
    dailyBudgetMicros: Math.round(b.dailyBudget * 1_000_000),
    bidding: b.bidding,
    targetCpaMicros: b.bidding === 'MAXIMIZE_CONVERSIONS' && b.targetCpa
      ? Math.round(b.targetCpa * 1_000_000) : null,
    geoTargets: b.geoTargets,
    languages: b.languages,
    finalUrl: b.finalUrl,
    headlines: b.headlines,
    longHeadlines: b.longHeadlines,
    descriptions: b.descriptions,
    businessName: b.businessName,
    path1: b.path1 || undefined,
    path2: b.path2 || undefined,
    keywords: b.keywords,
    images: b.images,
  };

  const errs = checkSpec(spec);
  if (errs.length) return NextResponse.json({ error: errs.join('. ') }, { status: 400 });

  let session;
  try {
    session = await googleSession(b.adAccountId);
  } catch (e) {
    const msg = e instanceof GoogleSetupError || e instanceof Error ? e.message : 'Lỗi không rõ';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (b.validateOnly) {
    try {
      await createGoogleCampaign(session.auth, session.customerId, spec, true);
      return NextResponse.json({ ok: true, validated: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Kiểm tra thất bại' }, { status: 422 },
      );
    }
  }

  const budgetText = `${b.dailyBudget.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${acct[0].currency === 'VND' ? 'đ' : ` ${acct[0].currency}`}/ngày`;
  const reason = `Đăng nhanh Google — ${KIND_VI[b.kind]}, ${b.bidding === 'MAXIMIZE_CLICKS' ? 'tối đa lượt nhấp' : 'tối đa chuyển đổi'}`;

  let made;
  try {
    made = await createGoogleCampaign(session.auth, session.customerId, spec);
  } catch (e) {
    // Lệnh mutate là nguyên tử: hỏng thì Google không tạo gì, không có rác để
    // dọn như phía Facebook. Vẫn GHI lần thất bại để tra lại về sau.
    const msg = e instanceof Error ? e.message : 'Lỗi không rõ';
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, error_message, idempotency_key, source)
       VALUES ($1,'',$2,'campaign_create','live','failed',
               'chưa có chiến dịch', 'không tạo được', $3, $4, $5, 'manual')
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [b.adAccountId, b.name, reason, msg, `manual-google-fail:${Date.now()}`],
    ).catch(() => {});

    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Chiến dịch ĐÃ được tạo. Ghi nhật ký lỗi thì chỉ ghi lại lỗi — trả "thất bại"
  // lúc này là khiến người dùng bấm lại và tạo trùng chiến dịch.
  try {
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, idempotency_key, source, applied_at)
       VALUES ($1,$2,$3,'campaign_create','live','applied',
               'chưa có chiến dịch', $4, $5, $6, 'manual', NOW())
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [
        b.adAccountId, made?.campaignId ?? '', b.name,
        `PAUSED · ${budgetText} · chiến dịch ${made?.campaignId ?? '?'}`,
        reason,
        `manual-google:${made?.campaignId ?? Date.now()}`,
      ],
    );
  } catch (e) {
    console.error('[google-quick] đã tạo nhưng không ghi được nhật ký:', e);
  }

  return NextResponse.json({ ok: true, ...made });
}
