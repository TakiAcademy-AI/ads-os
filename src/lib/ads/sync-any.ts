// Điều phối đồng bộ theo nền tảng.
//
// Bộ chạy theo lịch và nút Đồng bộ ngay đều đi qua đây, nên thêm nền tảng mới
// chỉ phải sửa một chỗ.

import { db } from '../db';
import { syncAccount, logSync, type SyncResult } from './sync';
import { syncGoogleAccount } from './google-sync';

export type { SyncResult };

export async function syncAnyAccount(
  adAccountId: string,
  opts: { lookbackDays?: number; level?: 'campaign' | 'adset' | 'ad'; extraFields?: string[] } = {},
): Promise<SyncResult> {
  const { rows } = await db.query(
    'SELECT platform FROM ad_account WHERE id = $1', [adAccountId],
  );
  const platform = rows[0]?.platform as string | undefined;

  if (platform === 'google') {
    // Google chưa hỗ trợ cấp adset/ad và chỉ số kéo thêm — bỏ qua hai tham số
    // đó thay vì giả vờ nhận rồi lặng lẽ không dùng.
    // syncAccount (Facebook) tự ghi sync_log; google-sync thì không — ghi ở đây
    // để lịch sử đồng bộ và lỗi đồng bộ Google hiện ở trang Kết nối.
    const r = await syncGoogleAccount(adAccountId, { lookbackDays: opts.lookbackDays });
    await logSync(adAccountId, r);
    return r;
  }
  if (platform === 'tiktok') {
    return {
      ok: false, campaigns: 0, metricRows: 0, revisionRows: 0, durationMs: 0,
      error: 'TikTok chưa được hỗ trợ',
    };
  }
  return syncAccount(adAccountId, opts);
}
