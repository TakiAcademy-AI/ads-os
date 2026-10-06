// Kéo chiến dịch + số liệu theo ngày từ TikTok về cùng bảng với Facebook/Google.
//
// Cấu trúc bám google-sync.ts: ad_metric_daily là số HIỆN TẠI (upsert), còn
// ad_metric_revision chỉ ghi thêm khi số đổi — TikTok cũng ghi nhận chuyển đổi
// muộn nên guard attribution dùng chung y hệt.

import { db } from '../db';
import { readToken } from './token';
import { listCampaigns, fetchInsights, mapObjective, TikTokError } from './tiktok';
import type { SyncResult } from './sync';
import { zeroMissingDays, campaignIdMap } from './sync-common';

/**
 * Ngày theo MÚI GIỜ TÀI KHOẢN — báo cáo TikTok tính ngày theo múi giờ đó. Dùng
 * giờ VN cho tài khoản đặt múi giờ khác là lệch một ngày ở đầu/cuối khoảng.
 */
function dateIn(tz: string, offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
}

export async function syncTikTokAccount(
  adAccountId: string, opts: { lookbackDays?: number } = {},
): Promise<SyncResult> {
  const started = Date.now();
  const base: SyncResult = { ok: false, campaigns: 0, metricRows: 0, revisionRows: 0, durationMs: 0 };
  // TikTok cho tối đa 365 ngày ngược; mặc định 30 như hai nền tảng kia.
  const lookback = Math.min(opts.lookbackDays ?? 30, 365);

  const { rows: acct } = await db.query(
    `SELECT external_id, timezone FROM ad_account WHERE id = $1 AND platform = 'tiktok'`, [adAccountId],
  );
  if (!acct[0]) return { ...base, error: 'Không tìm thấy tài khoản TikTok' };
  const token = await readToken(adAccountId);
  if (!token) return { ...base, error: 'Chưa có token TikTok — kết nối lại' };
  const advertiserId = acct[0].external_id as string;
  const tz = (acct[0].timezone as string) || 'Asia/Ho_Chi_Minh';

  try {
    // ── 1. Chiến dịch ──
    const campaigns = await listCampaigns(token, advertiserId);
    const idByExternal = new Map<string, string>();
    for (const c of campaigns) {
      const daily = c.budgetMode === 'BUDGET_MODE_DAY' || c.budgetMode === 'BUDGET_MODE_DYNAMIC_DAILY_BUDGET';
      const { rows } = await db.query(
        `INSERT INTO ad_campaign
           (ad_account_id, external_id, name, objective, objective_raw, status,
            daily_budget_micros, lifetime_budget_micros, start_time, updated_at)
         VALUES ($1,$2,$3,$4::ad_objective_t,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (ad_account_id, external_id) DO UPDATE SET
           name = EXCLUDED.name, objective = EXCLUDED.objective,
           objective_raw = EXCLUDED.objective_raw, status = EXCLUDED.status,
           daily_budget_micros = EXCLUDED.daily_budget_micros,
           lifetime_budget_micros = EXCLUDED.lifetime_budget_micros,
           start_time = EXCLUDED.start_time, updated_at = NOW()
         RETURNING id`,
        [
          adAccountId, c.id, c.name, mapObjective(c.objective), c.objective,
          // Chuẩn hoá về ACTIVE/PAUSED như Facebook: lớp tự động hoá so sánh với
          // 'PAUSED' và trang Chiến dịch đọc nhãn theo hai giá trị này.
          c.operationStatus === 'ENABLE' ? 'ACTIVE' : 'PAUSED',
          daily ? c.budgetMicros : null,
          c.budgetMode === 'BUDGET_MODE_TOTAL' ? c.budgetMicros : null,
          // create_time là UTC dạng "YYYY-MM-DD HH:MM:SS".
          c.createTime ? `${c.createTime.replace(' ', 'T')}Z` : null,
        ],
      );
      if (rows[0]) idByExternal.set(c.id, rows[0].id as string);
    }
    base.campaigns = campaigns.length;

    // ── 2. Số liệu theo ngày ──
    const since = dateIn(tz, lookback), until = dateIn(tz, 0);
    const insights = await fetchInsights(token, advertiserId, { since, until });
    // Chiến dịch đã xoá vẫn có thể có số — tra cả những chiến dịch đã lưu trước đó.
    const known = await campaignIdMap(adAccountId);
    const seen = new Set<string>();
    let metricRows = 0, revisionRows = 0;
    for (const row of insights) {
      const campaignId = idByExternal.get(row.campaignId) ?? known.get(row.campaignId);
      if (!campaignId || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      seen.add(`${campaignId}|${row.date}`);
      await db.query(
        `INSERT INTO ad_metric_daily
           (ad_account_id, campaign_id, ad_external_id, date,
            spend_micros, impressions, reach, clicks, conversions, ctr,
            extra_metrics, updated_at, conversion_action)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb,NOW(),$10)
         ON CONFLICT (ad_account_id, campaign_id, date)
           WHERE campaign_id IS NOT NULL AND ad_external_id IS NULL
         DO UPDATE SET
           spend_micros = EXCLUDED.spend_micros, impressions = EXCLUDED.impressions,
           reach = EXCLUDED.reach, clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions,
           ctr = EXCLUDED.ctr, updated_at = NOW(), conversion_action = EXCLUDED.conversion_action`,
        [
          adAccountId, campaignId, row.date, row.spendMicros, row.impressions, row.reach,
          row.clicks, row.conversions, row.ctr,
          // TikTok gộp chuyển đổi theo mục tiêu tối ưu vào một chỉ số "conversion".
          'tiktok_conversion',
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
        [adAccountId, campaignId, row.date, row.spendMicros, row.conversions, row.clicks],
      );
      revisionRows += rowCount ?? 0;
    }

    // Cùng bẫy với Google: ngày bị điều chỉnh về 0 có thể không còn dòng nào.
    const z = await zeroMissingDays(adAccountId, since, until, seen);
    metricRows += z.zeroed;
    revisionRows += z.revisions;

    await db.query(
      `UPDATE ad_account SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [adAccountId],
    );
    return { ok: true, campaigns: campaigns.length, metricRows, revisionRows, durationMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(
      `UPDATE ad_account SET last_error = $2,
         status = CASE WHEN $3 THEN 'error'::ad_account_status_t ELSE status END,
         updated_at = NOW() WHERE id = $1`,
      [adAccountId, msg, e instanceof TikTokError && e.isAuthProblem],
    ).catch(() => {});
    return { ...base, durationMs: Date.now() - started, error: msg };
  }
}
