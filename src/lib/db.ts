import { Pool } from 'pg';

// Pool singleton dùng chung cả process. Dev mode HMR nạp lại module liên tục,
// cache qua globalThis để không đốt hết connection limit.

declare global {
  // eslint-disable-next-line no-var
  var __adsPool: Pool | undefined;
}

// Timezone app. Nếu Postgres chạy UTC mà không set ở đây thì các filter dạng
// `date < CURRENT_DATE` sẽ lệch 1 ngày vào khoảng 17:00–24:00 giờ VN.
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thiếu biến môi trường DATABASE_URL');

  // Set timezone qua `options` lúc bắt tay, không qua event 'connect' —
  // handler async sẽ đua với query đầu tiên của caller.
  return new Pool({
    connectionString,
    options: `-c timezone=${APP_TIMEZONE}`,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export const db: Pool = globalThis.__adsPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalThis.__adsPool = db;

/** Cột DATE bị `pg` trả về thành JS Date ở nửa đêm GIỜ LOCAL — gọi
 *  .toISOString() lên nó là lùi 1 ngày trên máy UTC+7. Query nào cần chuỗi
 *  ngày thì dùng to_char(date,'YYYY-MM-DD') trong SQL, đừng ép ở JS. */
export const DATE_STR = `to_char(date, 'YYYY-MM-DD')`;
