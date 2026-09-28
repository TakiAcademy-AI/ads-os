/** Micros = giá trị × 1.000.000 (quy ước của spend_micros). */
export function vnd(micros: number): string {
  return `${Math.round(micros / 1_000_000).toLocaleString('vi-VN')}đ`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('vi-VN');
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export const OBJECTIVE_LABEL: Record<string, string> = {
  messages: 'Tin nhắn',
  leads: 'Lead form',
  sales: 'Chuyển đổi',
  traffic: 'Traffic',
  awareness: 'Nhận diện',
  video_views: 'Xem video',
  unknown: 'Khác',
};
