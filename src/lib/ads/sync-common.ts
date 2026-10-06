// Phần dùng chung cho đồng bộ Google và TikTok.

import { db } from '../db';

/**
 * Giờ địa phương "YYYY-MM-DD HH:MM:SS" theo múi giờ `tz` → ISO UTC.
 *
 * Google trả campaign.start_date_time theo GIỜ CỦA TÀI KHOẢN. Ghép thẳng thành
 * "...Z" là coi giờ VN như giờ UTC — lệch 7 tiếng, và chiến dịch bắt đầu sau
 * 17h giờ VN bị ghi sang ngày hôm sau.
 */
export function zonedToUtcIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const asUtc = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s);

  // Độ lệch của múi giờ tại một thời điểm (ms): giờ địa phương − giờ UTC.
  const offsetAt = (t: number): number => {
    try {
      const p: Record<string, string> = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      const n = (k: string) => Number(p[k] ?? 0);
      return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - t;
    } catch {
      return 0;   // Múi giờ lạ: coi như UTC còn hơn ném lỗi làm hỏng cả lượt đồng bộ.
    }
  };
  // Tính hai lần để đúng cả quanh thời điểm đổi giờ mùa hè.
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  return new Date(t).toISOString();
}

/**
 * Đưa về 0 những ngày mà nền tảng KHÔNG còn trả số liệu.
 *
 * Google (và báo cáo TikTok) BỎ HẲN dòng có mọi chỉ số bằng 0 thay vì trả về
 * 0. Khi nền tảng điều chỉnh một ngày về 0 — hoàn tiền click không hợp lệ,
 * huỷ chuyển đổi — dòng cũ khác 0 trong database không bao giờ bị ghi đè: chi
 * tiêu và CPA lệch mãi mãi.
 *
 * Chỉ gọi khi lấy số liệu THÀNH CÔNG cho trọn khoảng [since, until]: gọi sau
 * một lần lấy hỏng là xoá trắng số thật.
 *
 * `seen` chứa "<campaign uuid>|<YYYY-MM-DD>" của mọi dòng nền tảng vừa trả.
 * Trả về số ngày đã đưa về 0 và số dòng revision mới.
 */
export async function zeroMissingDays(
  adAccountId: string, since: string, until: string, seen: Set<string>,
): Promise<{ zeroed: number; revisions: number }> {
  const { rows } = await db.query(
    `SELECT campaign_id, to_char(date, 'YYYY-MM-DD') AS d
     FROM ad_metric_daily
     WHERE ad_account_id = $1 AND campaign_id IS NOT NULL AND ad_external_id IS NULL
       AND date BETWEEN $2::date AND $3::date
       AND (spend_micros <> 0 OR impressions <> 0 OR clicks <> 0 OR conversions <> 0)`,
    [adAccountId, since, until],
  );

  let zeroed = 0, revisions = 0;
  for (const r of rows) {
    if (seen.has(`${r.campaign_id}|${r.d}`)) continue;
    await db.query(
      `UPDATE ad_metric_daily
       SET spend_micros = 0, impressions = 0, reach = 0, clicks = 0, conversions = 0, ctr = 0,
           updated_at = NOW()
       WHERE ad_account_id = $1 AND campaign_id = $2 AND ad_external_id IS NULL AND date = $3::date`,
      [adAccountId, r.campaign_id, r.d],
    );
    zeroed++;
    // Ghi revision để lớp attribution thấy số đã bị điều chỉnh, như mọi lần số đổi.
    const { rowCount } = await db.query(
      `INSERT INTO ad_metric_revision
         (ad_account_id, campaign_id, ad_external_id, date, spend_micros, conversions, clicks)
       SELECT $1,$2,NULL,$3::date,0,0,0
       WHERE NOT EXISTS (
         SELECT 1 FROM (
           SELECT spend_micros, conversions, clicks FROM ad_metric_revision
           WHERE ad_account_id = $1 AND campaign_id IS NOT DISTINCT FROM $2
             AND ad_external_id IS NULL AND date = $3::date
           ORDER BY fetched_at DESC LIMIT 1
         ) last
         WHERE last.spend_micros = 0 AND last.conversions = 0 AND last.clicks = 0
       )`,
      [adAccountId, r.campaign_id, r.d],
    );
    revisions += rowCount ?? 0;
  }
  return { zeroed, revisions };
}

/** Bản đồ external_id → id nội bộ của MỌI chiến dịch đã lưu (kể cả đã xoá trên nền tảng). */
export async function campaignIdMap(adAccountId: string): Promise<Map<string, string>> {
  const { rows } = await db.query(
    `SELECT id, external_id FROM ad_campaign WHERE ad_account_id = $1`, [adAccountId],
  );
  return new Map(rows.map((r) => [r.external_id as string, r.id as string]));
}
