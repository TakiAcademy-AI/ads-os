// Lấy cách xác thực cho một tài khoản TikTok — app (REST) hoặc MCP.
//
// Với MCP, access token chỉ sống 24 giờ nên phải làm mới TỰ ĐỘNG trước khi
// dùng. Hai cái bẫy:
//   1. Nhiều tài khoản quảng cáo dùng chung MỘT lần cấp quyền (cùng
//      refresh token). Làm mới ở tài khoản này mà không cập nhật các tài khoản
//      kia là chúng giữ refresh token cũ — nếu TikTok xoay vòng refresh token,
//      các tài khoản đó hỏng ở lần làm mới sau.
//   2. Cron đồng bộ nhiều tài khoản cùng lúc: hai tiến trình cùng làm mới bằng
//      một refresh token, cái sau bị từ chối. Khoá theo lần cấp quyền
//      (pg_advisory_xact_lock) rồi đọc lại — ai vào sau dùng luôn token mới.

import { db } from '../db';
import { readToken, saveToken } from './token';
import { refreshTokens, McpAuthError, type McpTokens } from './tiktok-mcp';
import type { TtAuth } from './tiktok';

function parse(raw: string): McpTokens | null {
  try {
    const j = JSON.parse(raw);
    return j && typeof j.access_token === 'string' ? (j as McpTokens) : null;
  } catch { return null; }
}

/** Ghi token cho MỌI tài khoản TikTok MCP của người dùng cùng lần cấp quyền. */
export async function saveMcpTokens(ownerId: string, t: McpTokens, onlyIds?: string[]): Promise<void> {
  const { rows } = await db.query(
    `SELECT id FROM ad_account
     WHERE owner_id = $1 AND platform = 'tiktok' AND token_source = 'mcp'
       AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
    [ownerId, onlyIds ?? null],
  );
  for (const r of rows) {
    if (!onlyIds) {
      const cur = parse((await readToken(r.id)) ?? '');
      if (cur?.grant_id !== t.grant_id) continue;
    }
    await saveToken(r.id, JSON.stringify(t));
    await db.query(`UPDATE ad_account SET token_expires_at = to_timestamp($2 / 1000.0) WHERE id = $1`,
      [r.id, t.refresh_expires_at]);
  }
}

export async function getTikTokAuth(adAccountId: string): Promise<TtAuth> {
  const { rows } = await db.query(
    `SELECT owner_id, token_source FROM ad_account WHERE id = $1 AND platform = 'tiktok'`, [adAccountId],
  );
  if (!rows[0]) throw new Error('Không tìm thấy tài khoản TikTok');
  const raw = await readToken(adAccountId);
  if (!raw) throw new Error('Chưa có token TikTok — kết nối lại');
  if (rows[0].token_source !== 'mcp') return { kind: 'app', token: raw };

  let t = parse(raw);
  if (!t) throw new Error('Token TikTok MCP bị hỏng — kết nối lại');
  if (Date.now() < t.expires_at) return { kind: 'mcp', token: t.access_token };

  // Hết hạn: làm mới dưới khoá theo lần cấp quyền.
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tiktok-mcp:${t.grant_id}`]);
    // Đọc lại: tiến trình giữ khoá trước có thể đã làm mới xong.
    const again = parse((await readToken(adAccountId)) ?? '');
    if (again && Date.now() < again.expires_at) {
      await client.query('COMMIT');
      return { kind: 'mcp', token: again.access_token };
    }
    try {
      t = await refreshTokens(again ?? t);
    } catch (e) {
      await client.query('COMMIT');
      if (e instanceof McpAuthError) {
        // Chỉ đánh dấu tài khoản đang gọi; các tài khoản cùng lần cấp quyền sẽ
        // tự gặp đúng lỗi này ở lượt dùng kế tiếp của chúng.
        await db.query(
          `UPDATE ad_account SET status = 'error', last_error = $2, updated_at = NOW() WHERE id = $1`,
          [adAccountId, e.message],
        ).catch(() => {});
      }
      throw e;
    }
    await saveMcpTokens(rows[0].owner_id, t);
    await client.query('COMMIT');
    return { kind: 'mcp', token: t.access_token };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
