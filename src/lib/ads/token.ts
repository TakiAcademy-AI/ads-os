// Lưu và đọc access token của tài khoản quảng cáo.
//
// Token mã hoá bằng pgcrypto (pgp_sym_encrypt) với ENCRYPTION_KEY. Mã hoá/giải
// mã làm trong SQL để token thô không bao giờ nằm trong biến JS lâu hơn cần
// thiết, và để lộ file dump database vẫn không dùng được.
//
// Giới hạn cần biết: khoá nằm trong biến môi trường của app, nên ai đọc được
// cả DB lẫn env thì vẫn giải mã được. Muốn chặt hơn thì phải dùng KMS — chưa
// làm ở giai đoạn này.

import { db } from '../db';

function key(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error('Thiếu ENCRYPTION_KEY — không lưu được token');
  return k;
}

export async function saveToken(adAccountId: string, token: string): Promise<void> {
  await db.query(
    `UPDATE ad_account
     SET encrypted_token = pgp_sym_encrypt($2, $3), updated_at = NOW()
     WHERE id = $1`,
    [adAccountId, token, key()],
  );
}

/** Trả null nếu chưa có token hoặc khoá giải mã không khớp. */
export async function readToken(adAccountId: string): Promise<string | null> {
  try {
    const { rows } = await db.query(
      `SELECT pgp_sym_decrypt(encrypted_token, $2) AS token
       FROM ad_account WHERE id = $1 AND encrypted_token IS NOT NULL`,
      [adAccountId, key()],
    );
    return rows[0]?.token ?? null;
  } catch (e) {
    // Sai khoá → pgcrypto ném lỗi. Không để nó sập cả luồng đồng bộ.
    console.error('[token] không giải mã được token:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Che token khi hiển thị hoặc ghi log. */
export function maskToken(token: string): string {
  if (token.length <= 10) return '••••';
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
