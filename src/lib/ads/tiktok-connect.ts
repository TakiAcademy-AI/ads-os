// Lưu tài khoản TikTok sau khi có token — dùng chung cho đăng nhập app, dán
// token và kết nối qua MCP Server.

import { db } from '../db';
import { saveToken } from './token';
import { advertiserInfo, type TtAuth } from './tiktok';

/**
 * Lưu các tài khoản quảng cáo ở trạng thái 'pending' — người dùng chọn tài
 * khoản muốn dùng ở bảng Kết nối, như Facebook/Google.
 *
 * Thứ tự ưu tiên token: 'manual' (dán tay) là token CHÍNH — không nguồn nào
 * khác ghi đè, cùng lý do với token dán tay của Facebook. 'mcp' và 'oauth'
 * (app) ghi đè lẫn nhau: lần kết nối gần nhất thắng.
 *
 * `stored` là thứ được mã hoá vào encrypted_token: access token trơn (app,
 * dán tay) hoặc JSON token của MCP.
 */
export async function saveTikTokAccounts(
  ownerId: string, auth: TtAuth, advertiserIds: string[], source: 'oauth' | 'manual' | 'mcp',
  stored: string, expiresAt: number | null = null,
): Promise<{ saved: number; keptManual: number }> {
  const infos = await advertiserInfo(auth, advertiserIds);
  let saved = 0, keptManual = 0;
  for (const a of infos) {
    const { rows } = await db.query(
      `INSERT INTO ad_account
         (owner_id, platform, external_id, name, currency, timezone, status, connected_at, token_source)
       VALUES ($1,'tiktok',$2,$3,$4,$5,'pending',NOW(),$6)
       ON CONFLICT (owner_id, platform, external_id) DO UPDATE SET
         name = EXCLUDED.name, currency = EXCLUDED.currency, timezone = EXCLUDED.timezone,
         last_error = NULL, updated_at = NOW()
       RETURNING id, token_source, (xmax = 0) AS inserted`,
      [ownerId, a.id, a.name, a.currency, a.timezone, source],
    );
    const r = rows[0];
    if (!r) continue;
    if (source !== 'manual' && r.token_source === 'manual' && !r.inserted) { keptManual++; continue; }
    await saveToken(r.id, stored);
    await db.query(
      `UPDATE ad_account SET token_source = $2, token_expires_at = to_timestamp($3 / 1000.0),
         -- Tài khoản đang lỗi vì hết quyền: kết nối lại thì cho chạy tiếp.
         status = CASE WHEN status = 'error' THEN 'active'::ad_account_status_t ELSE status END
       WHERE id = $1`,
      [r.id, source, expiresAt],
    );
    saved++;
  }
  return { saved, keptManual };
}
