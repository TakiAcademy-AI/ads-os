// Lệnh GHI lên tài khoản quảng cáo Facebook.
//
// Tách riêng khỏi facebook.ts một cách có chủ đích: file kia đọc, file này tiêu
// tiền của người khác. Ai sửa file này phải biết mình đang đụng vào cái gì.
//
// Ở đây KHÔNG có logic quyết định. Quyết định nằm ở lib/automation/auto-pause.ts
// với đầy đủ guard. File này chỉ thực thi một lệnh đã được duyệt.

import { microsToMinor, minorToMicros } from './currency';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';
const TIMEOUT_MS = 20_000;

export class FacebookWriteError extends Error {
  constructor(message: string, readonly code?: number, readonly isPermission = false) {
    super(message);
    this.name = 'FacebookWriteError';
  }
}

interface GraphErr { message?: string; code?: number; error_subcode?: number }

/**
 * Gọi lệnh ghi. KHÔNG thử lại.
 *
 * Retry một lệnh ghi là nguy hiểm: request có thể đã tới Facebook và thành công
 * nhưng response mất trên đường về. Thử lại khi đó là tắt hai lần, hoặc tệ hơn
 * là ghi đè một thay đổi người dùng vừa làm tay. Thà báo lỗi để người xử lý.
 */
async function write(path: string, body: Record<string, string>, token: string): Promise<unknown> {
  const res = await fetch(`${GRAPH}/${VERSION}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: GraphErr };
  if (!res.ok) {
    const e = json.error ?? {};
    // 200/10 = thiếu quyền; 190 = token hỏng; 100 = tham số sai.
    const isPermission = e.code === 200 || e.code === 10 || e.code === 190;
    throw new FacebookWriteError(
      e.message ?? `Facebook trả HTTP ${res.status}`,
      e.code,
      isPermission,
    );
  }
  return json;
}

export type CampaignStatus = 'ACTIVE' | 'PAUSED';

/**
 * Đổi trạng thái chiến dịch.
 *
 * Cố ý KHÔNG hỗ trợ 'DELETED' hay 'ARCHIVED' — xoá là không hoàn tác được, và
 * không có tình huống nào tự động hoá cần xoá chiến dịch.
 */
export async function setCampaignStatus(
  token: string,
  campaignExternalId: string,
  status: CampaignStatus,
): Promise<void> {
  await write(`/${campaignExternalId}`, { status }, token);
}

/**
 * Đổi ngân sách/ngày của chiến dịch (CBO).
 *
 * Facebook nhận đơn vị nhỏ nhất của tiền tệ, KHÔNG phải micros — VND là đồng,
 * USD là cents. Vì vậy PHẢI truyền currency: chia cứng 1.000.000 sẽ đặt $0,15
 * thay cho $15 trên tài khoản USD, và nhật ký vẫn báo thành công.
 */
export async function setCampaignDailyBudget(
  token: string,
  campaignExternalId: string,
  budgetMicros: number,
  currency: string,
): Promise<void> {
  const value = microsToMinor(budgetMicros, currency);
  if (value <= 0) {
    throw new FacebookWriteError('Ngân sách phải lớn hơn 0');
  }
  await write(`/${campaignExternalId}`, { daily_budget: String(value) }, token);
}

/** Đọc lại ngân sách, trả về micros. null nếu không đọc được. */
export async function readCampaignBudget(
  token: string,
  campaignExternalId: string,
  currency: string,
): Promise<number | null> {
  const res = await fetch(
    `${GRAPH}/${VERSION}/${campaignExternalId}?fields=daily_budget`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { daily_budget?: string };
  if (!json.daily_budget) return null;
  return minorToMicros(json.daily_budget, currency);
}

/** Đọc lại trạng thái để xác nhận lệnh đã ăn — không tin response, tin dữ liệu. */
export async function readCampaignStatus(
  token: string,
  campaignExternalId: string,
): Promise<string | null> {
  const res = await fetch(
    `${GRAPH}/${VERSION}/${campaignExternalId}?fields=status`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { status?: string };
  return json.status ?? null;
}
