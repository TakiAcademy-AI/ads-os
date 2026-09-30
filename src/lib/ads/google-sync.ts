// Kéo số liệu từ Google Ads về cùng bảng với Facebook.
//
// Cấu trúc bám sát sync.ts để hai nền tảng cho ra dữ liệu so sánh được:
//   ad_metric_daily    = số HIỆN TẠI, upsert mỗi ngày một dòng
//   ad_metric_revision = lịch sử, chỉ ghi thêm KHI SỐ ĐỔI
//
// Google cũng sửa lại số của quá khứ như Facebook — chuyển đổi được ghi nhận
// muộn — nên lớp revision vẫn cần thiết y hệt, và guard attribution dùng chung.

import { db } from '../db';
import { googleSession, GoogleSetupError } from './google-session';
import {
  listCampaigns, fetchInsights, mapChannelType, GoogleAdsError,
} from './google';
import type { SyncResult } from './sync';

/** Hôm nay theo giờ VN. Không dùng UTC — máy chủ chạy UTC sẽ lệch ngày. */
function dateVn(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export async function syncGoogleAccount(
  adAccountId: string,
  opts: { lookbackDays?: number } = {},
): Promise<SyncResult> {
  const started = Date.now();
  const base: SyncResult = {
    ok: false, campaigns: 0, metricRows: 0, revisionRows: 0, durationMs: 0,
  };
  const lookback = opts.lookbackDays ?? 30;

  let session;
  try {
    session = await googleSession(adAccountId);
  } catch (e) {
    return {
      ...base,
      durationMs: Date.now() - started,
      error: e instanceof GoogleSetupError ? e.message
        : e instanceof Error ? e.message : String(e),
    };
  }

  const { auth, customerId } = session;

  try {
    // ── 1. Chiến dịch ──
    const campaigns = await listCampaigns(auth, customerId);
    const idByExternal = new Map<string, string>();

    for (const c of campaigns) {
      const { rows } = await db.query(
        `INSERT INTO ad_campaign
           (ad_account_id, external_id, name, objective, objective_raw, status,
            daily_budget_micros, lifetime_budget_micros, start_time, updated_at)
         VALUES ($1,$2,$3,$4::ad_objective_t,$5,$6,$7,NULL,$8,NOW())
         ON CONFLICT (ad_account_id, external_id) DO UPDATE SET
           name = EXCLUDED.name, objective = EXCLUDED.objective,
           objective_raw = EXCLUDED.objective_raw, status = EXCLUDED.status,
           daily_budget_micros = EXCLUDED.daily_budget_micros,
           start_time = EXCLUDED.start_time, updated_at = NOW()
         RETURNING id`,
        [
          adAccountId, c.id, c.name,
          mapChannelType(c.channelType),
          c.channelType,
          c.status,
          // amount_micros của Google ĐÃ là micros — không quy đổi gì thêm.
          c.dailyBudgetMicros,
          c.startDate ? `${c.startDate}T00:00:00Z` : null,
        ],
      );
      if (rows[0]) idByExternal.set(c.id, rows[0].id as string);
    }
    base.campaigns = campaigns.length;

    // ── 2. Số liệu theo ngày ──
    const insights = await fetchInsights(auth, customerId, {
      since: dateVn(lookback),
      until: dateVn(0),
    });

    let metricRows = 0;
    let revisionRows = 0;

    for (const row of insights) {
      const campaignId = idByExternal.get(row.campaignId);
      if (!campaignId) continue;   // Chiến dịch có số nhưng không đọc được ở bước 1.

      // Google trả MỘT chỉ số chuyển đổi duy nhất, dạng thập phân. Không có mớ
      // action_type trùng lặp như Facebook nên không có bẫy cộng dồn đếm ba lần.
      // Cột conversions là NUMERIC từ migration 009 để giữ phần thập phân.
      const conversions = row.conversions;

      await db.query(
        `INSERT INTO ad_metric_daily
           (ad_account_id, campaign_id, ad_external_id, date,
            spend_micros, impressions, reach, clicks, conversions, ctr,
            extra_metrics, updated_at, conversion_action)
         VALUES ($1,$2,NULL,$3,$4,$5,0,$6,$7,$8,'{}'::jsonb,NOW(),$9)
         ON CONFLICT (ad_account_id, campaign_id, date)
           WHERE campaign_id IS NOT NULL AND ad_external_id IS NULL
         DO UPDATE SET
           spend_micros = EXCLUDED.spend_micros, impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions,
           ctr = EXCLUDED.ctr, updated_at = NOW(),
           conversion_action = EXCLUDED.conversion_action`,
        [
          adAccountId, campaignId, row.date,
          row.costMicros, row.impressions, row.clicks, conversions, row.ctr,
          // Google gộp mọi loại chuyển đổi vào một chỉ số. Ghi rõ tên để trang
          // Chiến dịch không báo nhầm là "không đo được chuyển đổi".
          'google_conversions',
        ],
      );
      metricRows++;

      const { rowCount } = await db.query(
        `INSERT INTO ad_metric_revision
           (ad_account_id, campaign_id, ad_external_id, date, spend_micros, conversions, clicks)
         SELECT $1,$2,NULL,$3,$4,$5,$6
         WHERE NOT EXISTS (
           SELECT 1 FROM (
             SELECT spend_micros, conversions, clicks FROM ad_metric_revision
             WHERE ad_account_id = $1 AND campaign_id IS NOT DISTINCT FROM $2
               AND ad_external_id IS NULL AND date = $3
             ORDER BY fetched_at DESC LIMIT 1
           ) last
           WHERE last.spend_micros = $4 AND last.conversions = $5 AND last.clicks = $6
         )`,
        [adAccountId, campaignId, row.date, row.costMicros, conversions, row.clicks],
      );
      revisionRows += rowCount ?? 0;
    }

    await db.query(
      `UPDATE ad_account SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [adAccountId],
    );

    return {
      ok: true, campaigns: campaigns.length, metricRows, revisionRows,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof GoogleAdsError
      ? `${e.message}${e.isAuthProblem ? ' (token hỏng hoặc bị thu hồi — kết nối lại)' : ''}`
      : e instanceof Error ? e.message : String(e);
    await db.query(
      `UPDATE ad_account SET last_error = $2, updated_at = NOW() WHERE id = $1`,
      [adAccountId, msg],
    ).catch(() => {});
    return { ...base, durationMs: Date.now() - started, error: msg };
  }
}
