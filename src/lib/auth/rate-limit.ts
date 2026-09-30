// Chặn dò mật khẩu.
//
// ĐÁNH ĐỔI CỐ Ý: đếm theo CẶP (email, ip), không phải chỉ theo email.
//
// Khoá theo email thôi là biến cơ chế bảo vệ thành vũ khí — kẻ xấu chỉ cần gõ
// sai mật khẩu vài lần là khoá được tài khoản của người thật, mà chẳng cần biết
// mật khẩu. Đếm theo cặp thì kẻ dò phải đổi IP sau mỗi vài lần thử, còn người
// thật ngồi ở IP khác vẫn đăng nhập bình thường.
//
// Thêm một trần theo riêng IP để chặn kiểu rải: một IP thử một mật khẩu phổ
// biến qua hàng trăm email khác nhau.

import { db } from '../db';

/** Số lần sai tối đa cho một cặp (email, ip) trong cửa sổ thời gian. */
const MAX_PER_PAIR = 5;
/** Số lần sai tối đa cho một IP, bất kể email. */
const MAX_PER_IP = 20;
const WINDOW_MINUTES = 15;

export interface RateVerdict {
  blocked: boolean;
  /** Số giây còn phải chờ. 0 nếu không bị chặn. */
  retryAfterSeconds: number;
  reason?: string;
}

/**
 * Địa chỉ IP của người gọi.
 *
 * Sau nginx nên IP thật nằm ở x-forwarded-for; req.url không cho biết gì.
 * Lấy phần tử ĐẦU TIÊN — đó là client gốc, các phần sau là chuỗi proxy.
 *
 * Header này client giả được, nhưng chỉ khi nginx không ghi đè. Cấu hình nginx
 * của dự án có proxy_set_header X-Forwarded-For nên giá trị bị thay bằng IP
 * thật; ghi chú lại để ai đổi nginx biết mình đang phá cái gì.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function checkRate(email: string, ip: string): Promise<RateVerdict> {
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE email = $1 AND ip = $2)::int AS pair,
       count(*) FILTER (WHERE ip = $2)::int                AS by_ip,
       EXTRACT(EPOCH FROM (
         MIN(created_at) FILTER (WHERE email = $1 AND ip = $2)
         + ($3 || ' minutes')::interval - NOW()
       ))::int AS pair_wait,
       EXTRACT(EPOCH FROM (
         MIN(created_at) FILTER (WHERE ip = $2)
         + ($3 || ' minutes')::interval - NOW()
       ))::int AS ip_wait
     FROM login_attempt
     WHERE NOT ok AND created_at > NOW() - ($3 || ' minutes')::interval
       AND (ip = $2)`,
    [email.toLowerCase(), ip, WINDOW_MINUTES],
  );

  const r = rows[0] ?? {};
  const pair = Number(r.pair ?? 0);
  const byIp = Number(r.by_ip ?? 0);

  if (pair >= MAX_PER_PAIR) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Number(r.pair_wait ?? 60)),
      reason: `Sai mật khẩu ${pair} lần. Thử lại sau ít phút.`,
    };
  }
  if (byIp >= MAX_PER_IP) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Number(r.ip_wait ?? 60)),
      reason: 'Quá nhiều lần đăng nhập sai từ địa chỉ này.',
    };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export async function recordAttempt(email: string, ip: string, ok: boolean): Promise<void> {
  await db.query(
    'INSERT INTO login_attempt (email, ip, ok) VALUES ($1,$2,$3)',
    [email.toLowerCase(), ip, ok],
  ).catch(() => {});

  // Đăng nhập thành công thì xoá lịch sử sai của cặp này — người dùng gõ nhầm
  // vài lần rồi vào được không nên bị treo ở lần sau.
  if (ok) {
    await db.query(
      'DELETE FROM login_attempt WHERE email = $1 AND ip = $2 AND NOT ok',
      [email.toLowerCase(), ip],
    ).catch(() => {});
  }
}

/** Dọn bản ghi cũ. Gọi từ cron để bảng không phình vô hạn. */
export async function pruneAttempts(): Promise<number> {
  const { rowCount } = await db.query(
    "DELETE FROM login_attempt WHERE created_at < NOW() - INTERVAL '7 days'",
  );
  return rowCount ?? 0;
}
