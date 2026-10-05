// Lệnh GHI lên tài khoản Google Ads.
//
// Tách riêng khỏi google.ts một cách có chủ đích, giống cặp facebook.ts /
// facebook-write.ts: file kia đọc, file này tiêu tiền của người khác.
//
// KHÔNG có logic quyết định ở đây. Quyết định nằm ở lib/automation/ với đầy đủ
// guard; file này chỉ thực thi một lệnh đã được duyệt.

import { GoogleAdsError, gaql, extractError, type GoogleAuth } from './google';

const HOST = 'https://googleads.googleapis.com';
const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const TIMEOUT_MS = 25_000;

/**
 * Gọi lệnh ghi. KHÔNG thử lại.
 *
 * Cùng lý do với phía Facebook: request có thể đã tới Google và thành công
 * nhưng response mất trên đường về. Thử lại khi đó là tắt hai lần, hoặc ghi đè
 * một thay đổi người dùng vừa làm tay.
 */
async function mutate(
  auth: GoogleAuth,
  customerId: string,
  resource: 'campaigns' | 'campaignBudgets',
  operations: unknown[],
  validateOnly = false,
): Promise<void> {
  const cid = customerId.replace(/\D/g, '');
  const h: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
  };
  if (auth.developerToken) h['developer-token'] = auth.developerToken;
  if (auth.loginCustomerId) h['login-customer-id'] = auth.loginCustomerId.replace(/\D/g, '');

  const res = await fetch(`${HOST}/${VERSION}/customers/${cid}/${resource}:mutate`, {
    method: 'POST',
    headers: h,
    // validateOnly: Google kiểm payload và trả lỗi y như thật nhưng KHÔNG ghi
    // gì cả. Cùng cơ chế với execution_options của Facebook.
    body: JSON.stringify({ operations, validateOnly }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const msg = extractError(await res.json().catch(() => ({})), res.status);
    throw new GoogleAdsError(msg, res.status, res.status === 401 || res.status === 403);
  }
}

export type CampaignStatus = 'ENABLED' | 'PAUSED';

/**
 * Đổi trạng thái chiến dịch.
 *
 * Cố ý KHÔNG hỗ trợ 'REMOVED' — xoá chiến dịch Google là không hoàn tác được,
 * và không có tình huống tự động hoá nào cần xoá.
 */
export async function setCampaignStatus(
  auth: GoogleAuth,
  customerId: string,
  campaignId: string,
  status: CampaignStatus,
  validateOnly = false,
): Promise<void> {
  const cid = customerId.replace(/\D/g, '');
  await mutate(auth, customerId, 'campaigns', [{
    update: { resourceName: `customers/${cid}/campaigns/${campaignId}`, status },
    updateMask: 'status',
  }], validateOnly);
}

interface BudgetCheckRow {
  campaignBudget?: {
    resourceName?: string;
    amountMicros?: string;
    explicitlyShared?: boolean;
    referenceCount?: string;
  };
}

export interface BudgetInfo {
  resourceName: string;
  amountMicros: number;
  /** true = ngân sách này đang dùng chung cho nhiều chiến dịch. */
  shared: boolean;
  /** Số chiến dịch đang dùng ngân sách này. */
  referenceCount: number;
}

/**
 * Đọc thông tin ngân sách của một chiến dịch, KÈM cảnh báo dùng chung.
 *
 * ĐÂY LÀ CÁI BẪY LỚN NHẤT CỦA GOOGLE SO VỚI FACEBOOK. Google cho phép nhiều
 * chiến dịch dùng CHUNG một campaign_budget. Đổi ngân sách đó là đổi cho TẤT
 * CẢ chiến dịch đang dùng nó — người dùng đặt lịch tăng ngân sách giờ vàng cho
 * một chiến dịch có thể vô tình tăng cho mười chiến dịch khác.
 *
 * Facebook không có khái niệm này nên lớp automation chưa từng phải nghĩ tới.
 */
export async function getBudgetInfo(
  auth: GoogleAuth,
  customerId: string,
  campaignId: string,
): Promise<BudgetInfo | null> {
  const rows = await gaql<BudgetCheckRow>(auth, customerId,
    `SELECT campaign_budget.resource_name, campaign_budget.amount_micros,
            campaign_budget.explicitly_shared, campaign_budget.reference_count
     FROM campaign
     WHERE campaign.id = ${campaignId.replace(/\D/g, '')}`);

  const b = rows[0]?.campaignBudget;
  if (!b?.resourceName) return null;
  return {
    resourceName: b.resourceName,
    amountMicros: Number(b.amountMicros ?? 0),
    shared: b.explicitlyShared === true,
    referenceCount: Number(b.referenceCount ?? 1),
  };
}

/**
 * Đổi ngân sách/ngày của chiến dịch.
 *
 * TỪ CHỐI nếu ngân sách đang dùng chung: thà không làm gì còn hơn đổi ngân sách
 * của những chiến dịch người dùng không hề nhắc tới. Nơi gọi phải bắt lỗi này
 * và ghi vào nhật ký để người dùng biết vì sao chiến dịch đó bị bỏ qua.
 *
 * KHÁC FACEBOOK: Google nhận thẳng micros, không phải đơn vị nhỏ nhất của tiền
 * tệ. Không cần quy đổi theo currency.
 */
export async function setCampaignDailyBudget(
  auth: GoogleAuth,
  customerId: string,
  campaignId: string,
  budgetMicros: number,
  validateOnly = false,
): Promise<void> {
  if (budgetMicros <= 0) throw new GoogleAdsError('Ngân sách phải lớn hơn 0');

  const info = await getBudgetInfo(auth, customerId, campaignId);
  if (!info) throw new GoogleAdsError('Không đọc được ngân sách của chiến dịch này');
  if (info.shared || info.referenceCount > 1) {
    throw new GoogleAdsError(
      `Ngân sách này đang dùng chung cho ${info.referenceCount} chiến dịch — `
      + `đổi sẽ ảnh hưởng cả những chiến dịch khác, nên bỏ qua. `
      + `Tách ngân sách riêng cho chiến dịch nếu muốn tự động điều chỉnh.`,
    );
  }

  await mutate(auth, customerId, 'campaignBudgets', [{
    update: { resourceName: info.resourceName, amountMicros: String(Math.round(budgetMicros)) },
    updateMask: 'amount_micros',
  }], validateOnly);
}

/** Đọc lại trạng thái để xác nhận lệnh đã ăn — không tin response, tin dữ liệu. */
export async function readCampaignStatus(
  auth: GoogleAuth,
  customerId: string,
  campaignId: string,
): Promise<string | null> {
  const rows = await gaql<{ campaign?: { status?: string } }>(auth, customerId,
    `SELECT campaign.status FROM campaign
     WHERE campaign.id = ${campaignId.replace(/\D/g, '')}`).catch(() => []);
  return rows[0]?.campaign?.status ?? null;
}

/** Đọc lại ngân sách, trả micros. null nếu không đọc được. */
export async function readCampaignBudget(
  auth: GoogleAuth,
  customerId: string,
  campaignId: string,
): Promise<number | null> {
  const info = await getBudgetInfo(auth, customerId, campaignId).catch(() => null);
  return info?.amountMicros ?? null;
}
