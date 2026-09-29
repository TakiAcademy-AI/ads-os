// Quy đổi giữa micros của hệ thống và đơn vị nhỏ nhất của tiền tệ Facebook.
//
// NGUỒN SỰ THẬT DUY NHẤT cho hệ số này. Trước đây logic nằm rải ở ba chỗ và
// chúng không khớp nhau: hàm đọc xét tiền tệ, hai hàm ghi thì không — nên tài
// khoản USD đặt ngân sách $15 thành $0.15, sai 100 lần, mà nhật ký vẫn báo
// "Đã áp dụng".

/**
 * Tiền tệ không có đơn vị phụ. Facebook trả và nhận thẳng đơn vị chính.
 *
 * Các tiền tệ khác dùng hai chữ số thập phân: USD trả "1234" nghĩa là 12.34.
 * Danh sách theo ISO 4217, lấy phần Facebook thực sự hỗ trợ.
 */
const ZERO_DECIMAL = new Set([
  'VND', 'JPY', 'KRW', 'CLP', 'ISK', 'PYG', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** Bao nhiêu micros cho MỘT đơn vị nhỏ nhất của tiền tệ này. */
export function microsPerMinorUnit(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1_000_000 : 10_000;
}

/**
 * Đơn vị nhỏ nhất → micros. Dùng khi ĐỌC số từ Facebook.
 *
 * VND "50000" → 50.000.000.000 micros (50.000đ)
 * USD "1234"  → 12.340.000 micros ($12,34)
 */
export function minorToMicros(value: string | number | undefined, currency: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * microsPerMinorUnit(currency));
}

/**
 * Micros → đơn vị nhỏ nhất. Dùng khi GHI số lên Facebook.
 *
 * Đúng chiều ngược của minorToMicros. Sai chiều này thì tiền thật bị đặt sai.
 */
export function microsToMinor(micros: number, currency: string): number {
  return Math.round(micros / microsPerMinorUnit(currency));
}
