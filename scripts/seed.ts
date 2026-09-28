// Seed dữ liệu demo cho Ads OS.
//
//   npx tsx scripts/seed.ts
//
// Chạy lại được nhiều lần. Mô phỏng đúng hành vi attribution lag: CHỈ conversion
// về muộn, còn spend/impressions/clicks platform báo đủ trong ngày.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@taki.vn';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@123456';
const DAYS = 30;
const LAG = 7;

interface Spec {
  ext: string; name: string; objective: 'messages' | 'leads';
  status: string; dailyVnd: number; trueCpaVnd: number; whitelist?: boolean;
}

const CAMPAIGNS: Spec[] = [
  { ext: 'c_ai_basic', name: 'Tin nhắn - Khóa AI cơ bản',     objective: 'messages', status: 'ACTIVE', dailyVnd: 1_500_000, trueCpaVnd: 112_000 },
  { ext: 'c_ai_adv',   name: 'Tin nhắn - Khóa AI nâng cao',   objective: 'messages', status: 'ACTIVE', dailyVnd: 1_800_000, trueCpaVnd: 190_000 },
  { ext: 'c_biz',      name: 'Lead - Tư vấn doanh nghiệp',    objective: 'leads',    status: 'ACTIVE', dailyVnd: 1_200_000, trueCpaVnd:  64_000 },
  { ext: 'c_remarket', name: 'Tin nhắn - Remarketing 7 ngày', objective: 'messages', status: 'ACTIVE', dailyVnd:   900_000, trueCpaVnd:  78_000, whitelist: true },
  { ext: 'c_webinar',  name: 'Lead - Webinar tháng 10',       objective: 'leads',    status: 'ACTIVE', dailyVnd: 1_100_000, trueCpaVnd: 103_000 },
];

const vnd = (n: number) => Math.round(n * 1_000_000);
const ratio = (offset: number) => Math.min(1, 0.45 + 0.08 * offset);

function isoMinus(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const { rows: [user] } = await db.query<{ id: string }>(
    `INSERT INTO app_user (email, name, role, password_hash)
     VALUES ($1, 'TAKI Admin', 'admin', $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [ADMIN_EMAIL.toLowerCase(), hash],
  );
  if (!user) throw new Error('Không tạo được admin');

  await db.query(`DELETE FROM ad_account WHERE owner_id = $1`, [user.id]);

  const { rows: [acct] } = await db.query<{ id: string }>(
    `INSERT INTO ad_account
       (owner_id, platform, external_id, name, currency, timezone, status, connected_at, last_synced_at)
     VALUES ($1,'facebook','act_demo','TAKI Academy (DEMO)','VND','Asia/Ho_Chi_Minh','active',NOW(),NOW())
     RETURNING id`,
    [user.id],
  );
  if (!acct) throw new Error('Không tạo được ad_account');

  for (const [objective, cpa] of [['messages', 120_000], ['leads', 80_000]] as const) {
    await db.query(
      `INSERT INTO cpa_target (ad_account_id, objective, target_cpa_micros)
       VALUES ($1, $2, $3)
       ON CONFLICT (ad_account_id, objective) DO UPDATE
         SET target_cpa_micros = EXCLUDED.target_cpa_micros`,
      [acct.id, objective, vnd(cpa)],
    );
  }

  let daily = 0, revisions = 0;

  for (const c of CAMPAIGNS) {
    const { rows: [camp] } = await db.query<{ id: string }>(
      `INSERT INTO ad_campaign
         (ad_account_id, external_id, name, objective, status, daily_budget_micros, is_whitelisted, start_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - INTERVAL '${DAYS} days')
       RETURNING id`,
      [acct.id, c.ext, c.name, c.objective, c.status, vnd(c.dailyVnd * 1.2), c.whitelist ?? false],
    );
    if (!camp) throw new Error(`Không tạo được campaign ${c.ext}`);

    const trueConv = c.dailyVnd / c.trueCpaVnd;
    // Chỉ conversion bị lag. Click/impression xảy ra ngay lúc ad chạy.
    const clicks = Math.max(1, Math.round(trueConv)) * 6;
    const impressions = clicks * 14;

    for (let back = DAYS - 1; back >= 0; back--) {
      const date = isoMinus(back);
      const shown = Math.max(1, Math.round(trueConv * ratio(Math.min(back, LAG))));

      await db.query(
        `INSERT INTO ad_metric_daily
           (ad_account_id, campaign_id, date, spend_micros, impressions, reach, clicks, conversions, ctr)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [acct.id, camp.id, date, vnd(c.dailyVnd), impressions,
         Math.round(impressions / 1.6), clicks, shown, clicks / impressions],
      );
      daily++;

      for (let offset = 0; offset <= Math.min(back, LAG + 1); offset++) {
        await db.query(
          `INSERT INTO ad_metric_revision
             (ad_account_id, campaign_id, date, fetched_at, spend_micros, conversions, clicks)
           VALUES ($1,$2,$3,$4::date + TIME '23:00',$5,$6,$7)`,
          [acct.id, camp.id, date, isoMinus(back - offset), vnd(c.dailyVnd),
           Math.max(1, Math.round(trueConv * ratio(offset))), clicks],
        );
        revisions++;
      }
    }
  }

  const { rows: camps } = await db.query<{ id: string; external_id: string; name: string }>(
    `SELECT id, external_id, name FROM ad_campaign WHERE ad_account_id = $1`, [acct.id]);
  const byExt = new Map(camps.map((c) => [c.external_id, c]));

  const LOG: Array<[string, string, string, string, string, string | null, number, number | null, number | null, number]> = [
    ['c_ai_adv',   'live',    'applied', 'ACTIVE', 'PAUSED',
     null, 2, vnd(231_193), vnd(200_000), vnd(120_000)],
    ['c_ai_basic', 'dry_run', 'blocked', 'ACTIVE', 'PAUSED',
     'attribution_window', 5, vnd(136_364), vnd(115_385), vnd(120_000)],
    ['c_webinar',  'dry_run', 'blocked', 'ACTIVE', 'PAUSED',
     'attribution_window', 9, vnd(180_000), null, vnd(80_000)],
    ['c_remarket', 'dry_run', 'blocked', 'ACTIVE', 'PAUSED',
     'whitelist', 26, vnd(131_000), vnd(98_000), vnd(120_000)],
  ];

  const REASON: Record<string, string> = {
    c_ai_adv: 'CPA đã chín 200.000đ vượt ngưỡng 120.000đ (tính trên dữ liệu đã qua cửa sổ attribution, 63 chuyển đổi). Kết luận không bị ảnh hưởng bởi chuyển đổi chưa về.',
    c_ai_basic: 'GIỮ LẠI: CPA thô 136.364đ vượt ngưỡng 120.000đ, nhưng CPA đã chín chỉ 115.385đ — vẫn dưới ngưỡng. Chênh lệch do chuyển đổi 7 ngày gần nhất chưa về đủ.',
    c_webinar: 'Chưa đủ dữ liệu đã chín để kết luận: 4 chuyển đổi / 58 click (cần tối thiểu 10 chuyển đổi và 100 click).',
    c_remarket: 'Chiến dịch nằm trong whitelist — chỉ gửi cảnh báo, không tắt.',
  };

  for (const [ext, mode, status, before, after, blockedBy, hours, raw, settled, target] of LOG) {
    const c = byExt.get(ext);
    if (!c) continue;
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, campaign_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, blocked_by,
          cpa_raw_micros, cpa_settled_micros, target_cpa_micros,
          idempotency_key, applied_at, created_at)
       VALUES ($1,$2,$3,$4,'pause',$5::ad_mutation_mode_t,$6::ad_mutation_status_t,
               $7,$8,$9,$10,$11,$12,$13,$14,
               CASE WHEN $6 = 'applied' THEN NOW() - INTERVAL '${hours} hours' END,
               NOW() - INTERVAL '${hours} hours')`,
      [acct.id, c.id, ext, c.name, mode, status, before, after, REASON[ext] ?? '', blockedBy,
       raw, settled, target, `${ext}:pause:${isoMinus(0)}`],
    );
  }

  console.log(
    `Xong.\n  đăng nhập: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}\n` +
    `  campaign=${CAMPAIGNS.length} metric=${daily} revision=${revisions} nhật ký=${LOG.length}`,
  );
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
