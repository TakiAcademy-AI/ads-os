// Lưu tài khoản TikTok sau khi có token — dùng chung cho đăng nhập và dán token.

import { db } from '../db';
import { saveToken } from './token';
import { advertiserInfo } from './tiktok';

/**
 * Lưu các tài khoản quảng cáo vào trạng thái 'pending' — người dùng chọn tài
 * khoản muốn dùng ở bảng Kết nối, như Facebook/Google.
 *
 * source = 'manual' (dán tay) là token CHÍNH: đăng nhập TikTok về sau không ghi
 * đè, cùng lý do với token dán tay của Facebook. Trả số tài khoản giữ nguyên.
 */
export async function saveTikTokAccounts(
  ownerId: string, token: string, advertiserIds: string[], source: 'oauth' | 'manual',
): Promise<{ saved: number; keptManual: number }> {
  const infos = await advertiserInfo(token, advertiserIds);
  let saved = 0, keptManual = 0;
  for (const a of infos) {
    const { rows } = await db.query(
      `INSERT INTO ad_account
         (owner_id, platform, external_id, name, currency, timezone, status, connected_at, token_source)
       VALUES ($1,'tiktok',$2,$3,$4,$5,'pending',NOW(),$6)
       ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
         name = EXCLUDED.name, currency = EXCLUDED.currency, timezone = EXCLUDED.timezone,
         token_source = CASE WHEN $6 = 'manual' THEN 'manual' ELSE ad_account.token_source END,
         last_error = NULL, updated_at = NOW()
       RETURNING id, token_source`,
      [ownerId, a.id, a.name, a.currency, a.timezone, source],
    );
    const r = rows[0];
    if (!r) continue;
    if (source === 'oauth' && r.token_source === 'manual') { keptManual++; continue; }
    await saveToken(r.id, token);
    saved++;
  }
  return { saved, keptManual };
}
