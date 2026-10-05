import { db } from './db';
import { getSession } from './session';

/**
 * Tài khoản QC đang xem.
 *
 * Ưu tiên lựa chọn lưu trong session, nhưng PHẢI kiểm lại quyền sở hữu mỗi
 * lần đọc — không thì ai sửa được cookie sẽ xem được tài khoản người khác.
 * Không có lựa chọn hợp lệ thì lấy tài khoản active tạo sớm nhất.
 */
export async function getCurrentAccountId(ownerId: string): Promise<string | null> {
  const session = await getSession();
  if (session.accountId) {
    const { rows } = await db.query(
      `SELECT id FROM ad_account
       WHERE id = $1 AND owner_id = $2 AND status = 'active'`,
      [session.accountId, ownerId],
    );
    if (rows[0]) return rows[0].id;
  }

  const { rows } = await db.query(
    `SELECT id FROM ad_account
     WHERE owner_id = $1 AND status = 'active'
     ORDER BY created_at LIMIT 1`,
    [ownerId],
  );
  return rows[0]?.id ?? null;
}

export interface AccountOption {
  id: string;
  name: string;
  externalId: string;
  currency: string;
  /** 'facebook' | 'google' | 'tiktok' */
  platform: string;
}

/** Tài khoản đang bật, để dựng bộ chọn. */
export async function listActiveAccounts(ownerId: string): Promise<AccountOption[]> {
  const { rows } = await db.query(
    `SELECT id, name, external_id, currency, platform FROM ad_account
     WHERE owner_id = $1 AND status = 'active' ORDER BY name`,
    [ownerId],
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, externalId: r.external_id, currency: r.currency, platform: r.platform,
  }));
}

/** Hôm nay theo giờ VN, dạng YYYY-MM-DD. Không dùng new Date().toISOString()
 *  vì máy chủ chạy UTC sẽ lệch ngày vào buổi tối giờ VN. */
export function todayVn(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
