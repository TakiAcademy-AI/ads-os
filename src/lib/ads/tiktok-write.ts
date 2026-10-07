// Lệnh GHI lên tài khoản TikTok Ads. Tách khỏi tiktok.ts như Facebook/Google.
//
// KHÔNG thử lại (ttCall chỉ thử lại GET). KHÔNG có thao tác DELETE — TikTok
// không cho sửa lại đối tượng đã xoá, và không tình huống nào ở đây cần xoá.
//
// Ngân sách: đơn vị TIỀN TỆ có phần lẻ (không phải micros). Ngân sách mới phải
// ≥ 105% số đã tiêu hôm nay; tối thiểu ~20 USD/ngày (200.000đ) với nhóm quảng
// cáo — TikTok tự từ chối kèm lý do nếu sai.

import { ttCall, microsToTtMoney, toCampaign, type TtCampaign, type TtAuth } from './tiktok';

export type TtStatus = 'ENABLE' | 'DISABLE';

export async function setCampaignStatus(token: TtAuth, advertiserId: string, campaignId: string, status: TtStatus): Promise<void> {
  await ttCall('POST', 'campaign/status/update', token, {
    advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: status,
  });
}

export async function getCampaign(token: TtAuth, advertiserId: string, campaignId: string): Promise<TtCampaign | null> {
  const d = await ttCall<{ list?: Record<string, unknown>[] }>('GET', 'campaign/get', token, {
    advertiser_id: advertiserId,
    filtering: { campaign_ids: [campaignId] },
    fields: ['campaign_id', 'campaign_name', 'objective_type', 'operation_status', 'secondary_status',
      'budget', 'budget_mode', 'create_time'],
  });
  return d.list?.[0] ? toCampaign(d.list[0]) : null;
}

/**
 * Đổi ngân sách/ngày của CHIẾN DỊCH. Chỉ khi chiến dịch đặt ngân sách theo
 * ngày — chiến dịch "không giới hạn" thì ngân sách nằm ở nhóm quảng cáo, đặt
 * vào chiến dịch là đổi luôn cách phân bổ tiền mà người dùng không hề định.
 */
export async function setCampaignDailyBudget(
  token: TtAuth, advertiserId: string, campaignId: string, budgetMicros: number, currency: string,
): Promise<void> {
  const c = await getCampaign(token, advertiserId, campaignId);
  if (!c) throw new Error('Không tìm thấy chiến dịch trên TikTok');
  if (c.budgetMode !== 'BUDGET_MODE_DAY' && c.budgetMode !== 'BUDGET_MODE_DYNAMIC_DAILY_BUDGET') {
    throw new Error('Chiến dịch này không đặt ngân sách theo ngày ở cấp chiến dịch — sửa ngân sách ở từng nhóm quảng cáo.');
  }
  const budget = microsToTtMoney(budgetMicros, currency);
  if (budget <= 0) throw new Error('Ngân sách phải lớn hơn 0');
  await ttCall('POST', 'campaign/update', token, { advertiser_id: advertiserId, campaign_id: campaignId, budget });
}

export async function renameCampaign(token: TtAuth, advertiserId: string, campaignId: string, name: string): Promise<void> {
  await ttCall('POST', 'campaign/update', token, { advertiser_id: advertiserId, campaign_id: campaignId, campaign_name: name });
}

export async function setAdGroupStatus(token: TtAuth, advertiserId: string, adgroupId: string, status: TtStatus): Promise<void> {
  await ttCall('POST', 'adgroup/status/update', token, {
    advertiser_id: advertiserId, adgroup_ids: [adgroupId], operation_status: status,
  });
}

/**
 * Đổi ngân sách/ngày của NHÓM quảng cáo. Với ngân sách theo ngày TikTok bắt
 * dùng scheduled_budget — CÓ HIỆU LỰC TỪ 00:00 NGÀY HÔM SAU theo giờ tài khoản,
 * không phải ngay lập tức. Nơi gọi phải báo điều này cho người dùng.
 */
export async function setAdGroupDailyBudget(
  token: TtAuth, advertiserId: string, adgroupId: string, budgetMicros: number, currency: string,
): Promise<void> {
  const budget = microsToTtMoney(budgetMicros, currency);
  if (budget <= 0) throw new Error('Ngân sách phải lớn hơn 0');
  await ttCall('POST', 'adgroup/budget/update', token, {
    advertiser_id: advertiserId, scheduled_budget: [{ adgroup_id: adgroupId, scheduled_budget: budget }],
  });
}

export async function setAdStatus(token: TtAuth, advertiserId: string, adId: string, status: TtStatus): Promise<void> {
  await ttCall('POST', 'ad/status/update', token, {
    advertiser_id: advertiserId, ad_ids: [adId], operation_status: status,
  });
}
