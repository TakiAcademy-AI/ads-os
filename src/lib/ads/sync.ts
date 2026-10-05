// Kéo số liệu thật từ Facebook về ad_metric_daily + ad_metric_revision.
//
// ad_metric_daily = số HIỆN TẠI (upsert, mỗi ngày một dòng).
// ad_metric_revision = lịch sử, chỉ ghi thêm KHI SỐ ĐỔI. Cron kéo lại cả cửa
// sổ 30 ngày mỗi lần chạy nhưng ngày cũ đã đứng yên — ghi mọi lần sync là nhân
// 30 lần dung lượng mà không thêm thông tin. Giá trị tại thời điểm bất kỳ vẫn
// suy ra được = revision gần nhất trước đó.

import { db } from '../db';
import { readToken } from './token';
import {
  fetchInsights, listCampaigns, spendToMicros, countConversions, mapObjective,
  FacebookError, type FbInsight,
} from './facebook';

export interface SyncResult {
  ok: boolean;
  campaigns: number;
  metricRows: number;
  revisionRows: number;
  durationMs: number;
  error?: string;
}

function isoMinus(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function syncAccount(
  adAccountId: string,
  opts: { lookbackDays?: number; level?: 'campaign' | 'adset' | 'ad'; extraFields?: string[] } = {},
): Promise<SyncResult> {
  const started = Date.now();
  const lookback = opts.lookbackDays ?? 30;

  // CHỐT CỨNG ở cấp chiến dịch cho tới khi đường ghi hỗ trợ cấp sâu hơn.
  //
  // Câu INSERT phía dưới ghi ad_external_id = NULL và dùng ON CONFLICT ...
  // DO UPDATE SET (ghi đè, không cộng dồn). Ở cấp 'ad', Facebook trả NHIỀU
  // dòng cho mỗi (chiến dịch, ngày) — mỗi quảng cáo một dòng — nên tất cả rơi
  // vào cùng một khoá xung đột và mỗi dòng xoá kết quả của dòng trước. Chiến
  // dịch có 3 quảng cáo tiêu 10k/20k/30k sẽ lưu thành 30k thay vì 60k.
  //
  // Mất chi tiêu kéo theo CPA thấp giả, và guard sẽ KHÔNG tắt chiến dịch đang
  // thật sự lỗ. Thà kéo ít dữ liệu còn hơn kéo về dữ liệu sai.
  const level = 'campaign';
  if (opts.level && opts.level !== 'campaign') {
    console.warn(`[sync] bỏ qua level='${opts.level}', đường ghi chỉ hỗ trợ cấp chiến dịch`);
  }

  const base: SyncResult = {
    ok: false, campaigns: 0, metricRows: 0, revisionRows: 0, durationMs: 0,
  };

  const { rows: accts } = await db.query(
    `SELECT id, external_id, currency FROM ad_account WHERE id = $1`, [adAccountId],
  );
  const acct = accts[0];
  if (!acct) return { ...base, error: 'Không tìm thấy tài khoản quảng cáo' };

  const token = await readToken(adAccountId);
  if (!token) return { ...base, error: 'Tài khoản chưa có token, hoặc token không giải mã được' };

  // external_id lưu dạng 'act_<số>' hoặc chỉ số — Graph API cần có tiền tố.
  const actId = acct.external_id.startsWith('act_') ? acct.external_id : `act_${acct.external_id}`;
  const currency: string = acct.currency;

  try {
    // ── 1. Chiến dịch ──
    const campaigns = await listCampaigns(token, actId);
    const idByExternal = new Map<string, string>();

    for (const c of campaigns) {
      const { rows } = await db.query(
        `INSERT INTO ad_campaign
           (ad_account_id, external_id, name, objective, objective_raw, status,
            daily_budget_micros, lifetime_budget_micros, start_time, updated_at)
         VALUES ($1,$2,$3,$4::ad_objective_t,$9,$5,$6,$7,$8,NOW())
         ON CONFLICT (ad_account_id, external_id) DO UPDATE SET
           name = EXCLUDED.name, objective = EXCLUDED.objective,
           objective_raw = EXCLUDED.objective_raw,
           status = EXCLUDED.status,
           daily_budget_micros = EXCLUDED.daily_budget_micros,
           lifetime_budget_micros = EXCLUDED.lifetime_budget_micros,
           updated_at = NOW()
         RETURNING id`,
        [
          adAccountId, c.id, c.name, mapObjective(c.objective ?? ''), c.status ?? 'UNKNOWN',
          c.daily_budget ? spendToMicros(c.daily_budget, currency) : null,
          c.lifetime_budget ? spendToMicros(c.lifetime_budget, currency) : null,
          c.start_time ?? null,
          c.objective ?? null,
        ],
      );
      if (rows[0]) idByExternal.set(c.id, rows[0].id);
    }

    // Mục tiêu để đếm chuyển đổi đúng loại action.
    const objectiveByExternal = new Map(
      campaigns.map((c) => [c.id, mapObjective(c.objective ?? '')]),
    );

    // ── 2. Số liệu theo ngày ──
    const insights: FbInsight[] = await fetchInsights(token, actId, {
      since: isoMinus(lookback),
      until: isoMinus(0),
      level,
      extraFields: opts.extraFields,
    });

    let metricRows = 0;
    let revisionRows = 0;

    for (const row of insights) {
      const extId = row.campaign_id;
      if (!extId) continue;
      const campaignId = idByExternal.get(extId);
      if (!campaignId) continue; // chiến dịch có số nhưng không còn trong danh sách

      const spend = spendToMicros(row.spend, currency);
      // countConversions trả cả loại hành động đã dùng — lưu lại để giao diện
      // nói được "đang đếm theo cái gì", và để phân biệt "đo được, bằng 0" với
      // "không đo được". Hai thứ đó khác nhau hoàn toàn khi quyết định tắt ads.
      const conv = countConversions(row.actions, objectiveByExternal.get(extId) ?? 'unknown');
      const conversions = conv.count;
      const impressions = Number(row.impressions ?? 0) || 0;
      const reach = Number(row.reach ?? 0) || 0;
      const clicks = Number(row.clicks ?? 0) || 0;
      const ctr = row.ctr ? Number(row.ctr) / 100 : null; // FB trả phần trăm

      // Giữ các chỉ số ngoài nhóm bắt buộc, không đổi cấu trúc bảng.
      const extra: Record<string, unknown> = {};
      for (const f of opts.extraFields ?? []) {
        if (row[f] !== undefined) extra[f] = row[f];
      }

      await db.query(
        `INSERT INTO ad_metric_daily
           (ad_account_id, campaign_id, ad_external_id, date,
            spend_micros, impressions, reach, clicks, conversions, ctr, extra_metrics,
            updated_at, conversion_action)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),$11)
         ON CONFLICT (ad_account_id, campaign_id, date)
           WHERE campaign_id IS NOT NULL AND ad_external_id IS NULL
         DO UPDATE SET
           spend_micros = EXCLUDED.spend_micros, impressions = EXCLUDED.impressions,
           reach = EXCLUDED.reach, clicks = EXCLUDED.clicks,
           conversions = EXCLUDED.conversions, ctr = EXCLUDED.ctr,
           extra_metrics = EXCLUDED.extra_metrics, updated_at = NOW(),
           conversion_action = EXCLUDED.conversion_action`,
        [adAccountId, campaignId, row.date_start, spend, impressions, reach, clicks,
         conversions, ctr, JSON.stringify(extra), conv.actionType],
      );
      metricRows++;

      // Revision: chỉ ghi khi khác lần kéo gần nhất.
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
        [adAccountId, campaignId, row.date_start, spend, conversions, clicks],
      );
      revisionRows += rowCount ?? 0;
    }

    await db.query(
      `UPDATE ad_account SET last_synced_at = NOW(), last_error = NULL, status = 'active'
       WHERE id = $1`, [adAccountId],
    );

    const result: SyncResult = {
      ok: true, campaigns: campaigns.length, metricRows, revisionRows,
      durationMs: Date.now() - started,
    };
    await logSync(adAccountId, result);
    return result;
  } catch (e) {
    const msg = e instanceof FacebookError
      ? `${e.message}${e.isTokenProblem ? ' (token hỏng hoặc hết hạn — cần kết nối lại)' : ''}`
      : e instanceof Error ? e.message : String(e);

    await db.query(
      `UPDATE ad_account SET last_error = $2, status = CASE WHEN $3 THEN 'error' ELSE status END
       WHERE id = $1`,
      [adAccountId, msg, e instanceof FacebookError && e.isTokenProblem],
    );

    const result: SyncResult = { ...base, durationMs: Date.now() - started, error: msg };
    await logSync(adAccountId, result);
    return result;
  }
}

export async function logSync(adAccountId: string, r: SyncResult): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sync_log (ad_account_id, job, ok, rows_written, duration_ms, message)
       VALUES ($1, 'metric_sync', $2, $3, $4, $5)`,
      [adAccountId, r.ok, r.metricRows, r.durationMs,
       r.error ?? `${r.campaigns} chiến dịch, ${r.revisionRows} revision mới`],
    );
  } catch (e) {
    console.error('[sync] không ghi được sync_log:', e);
  }
}
