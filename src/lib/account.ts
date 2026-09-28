import { db } from './db';

/** Tài khoản QC đang chọn. Giai đoạn này lấy tài khoản active đầu tiên;
 *  khi có nhiều tài khoản sẽ thay bằng bộ chọn lưu trong session. */
export async function getCurrentAccountId(ownerId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT id FROM ad_account
     WHERE owner_id = $1 AND status = 'active'
     ORDER BY created_at LIMIT 1`,
    [ownerId],
  );
  return rows[0]?.id ?? null;
}

/** Hôm nay theo giờ VN, dạng YYYY-MM-DD. Không dùng new Date().toISOString()
 *  vì máy chủ chạy UTC sẽ lệch ngày vào buổi tối giờ VN. */
export function todayVn(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
