// Đăng nhanh TikTok — đẩy một bài đăng có sẵn của kênh TikTok (Spark Ads).
//
// Bám tài liệu chính thức v1.3 (campaign/create 1739318962329602, adgroup/create
// 1739499616346114, ad/create 1739953377508354, Spark Ads 1739470744631298) và
// một chiến dịch Spark Ads THẬT đang chạy trong tài khoản (đọc qua API).
//
// KHÁC GOOGLE: TikTok không có lệnh tạo nguyên tử, cũng không có validate_only.
// Tạo lần lượt chiến dịch → nhóm → quảng cáo; hỏng giữa chừng thì XOÁ chiến
// dịch vừa tạo (xoá chiến dịch kéo theo nhóm và quảng cáo bên trong). Đó là thứ
// Ads OS vừa tạo vài giây trước, không phải của người dùng.
//
// Mọi cấp đều tạo với operation_status DISABLE — chưa tiêu đồng nào cho tới khi
// người dùng tự bật.

import { randomInt } from 'node:crypto';
import { ttCall, TikTokError, type TtAuth } from './tiktok';
import { TT_OBJECTIVES, type TtQuickSpec } from './tiktok-create-spec';

export class TtCreateError extends Error {
  constructor(message: string, readonly step: 'chiến dịch' | 'nhóm quảng cáo' | 'quảng cáo', readonly cleanedUp: boolean | null) {
    super(message);
    this.name = 'TtCreateError';
  }
}

/** "YYYY-MM-DD HH:MM:SS" theo UTC+0 — định dạng schedule_start_time của TikTok. */
function utcNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export async function createSparkCampaign(
  auth: TtAuth, advertiserId: string, s: TtQuickSpec,
): Promise<{ campaignId: string; adgroupId: string; adId: string; budgetMode: string }> {
  const obj = TT_OBJECTIVES.find((o) => o.id === s.objective);
  if (!obj) throw new TtCreateError('Mục tiêu không hỗ trợ', 'chiến dịch', null);

  // ── 1. Chiến dịch: không giới hạn ngân sách — tiền đặt ở nhóm quảng cáo, như
  // chiến dịch thật trong tài khoản. Tài liệu: BUDGET_MODE_DAY ở cấp chiến dịch
  // không CBO đã bị bỏ cho REACH/VIDEO_VIEWS/ENGAGEMENT.
  let campaignId: string;
  try {
    const c = await ttCall<{ campaign_id?: string | number }>('POST', 'campaign/create', auth, {
      advertiser_id: advertiserId,
      campaign_name: s.campaignName.slice(0, 512),
      objective_type: s.objective,
      budget_mode: 'BUDGET_MODE_INFINITE',
      operation_status: 'DISABLE',
      // Chống tạo trùng nếu request bị gửi lại trong 10 giây.
      request_id: String(randomInt(1, 2 ** 47)),
    });
    if (!c?.campaign_id) throw new Error('TikTok không trả campaign_id');
    campaignId = String(c.campaign_id);
  } catch (e) {
    throw new TtCreateError(e instanceof Error ? e.message : String(e), 'chiến dịch', null);
  }

  const cleanup = async (): Promise<boolean> => {
    try {
      await ttCall('POST', 'campaign/status/update', auth, {
        advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: 'DELETE',
      });
      return true;
    } catch { return false; }
  };

  // ── 2. Nhóm quảng cáo ──
  const adgroupBase = {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    adgroup_name: `${s.campaignName} · nhóm 1`.slice(0, 512),
    placement_type: 'PLACEMENT_TYPE_NORMAL',
    placements: ['PLACEMENT_TIKTOK'],
    location_ids: s.locationIds,
    age_groups: s.ageGroups,
    gender: s.gender,
    budget: s.dailyBudget,
    schedule_type: 'SCHEDULE_FROM_NOW',
    schedule_start_time: utcNow(),
    optimization_goal: obj.goal,
    billing_event: obj.billing,
    bid_type: 'BID_TYPE_NO_BID',
    // BID_TYPE_NO_BID chỉ đi với SMOOTH.
    pacing: 'PACING_MODE_SMOOTH',
    operation_status: 'DISABLE',
    ...(s.objective === 'VIDEO_VIEWS' ? { bid_display_mode: 'CPV' } : {}),
    ...(s.objective === 'REACH' ? { frequency: 3, frequency_schedule: 7 } : {}),
    ...(s.objective === 'TRAFFIC' ? { promotion_type: 'WEBSITE' } : {}),
  };

  // Ngân sách "linh hoạt theo ngày" là cách TikTok khuyên cho các mục tiêu
  // này (và là cách chiến dịch thật trong tài khoản dùng) nhưng có thể cần
  // allowlist với tài khoản mới — bị từ chối thì thử lại bằng ngân sách ngày thường.
  let adgroupId: string;
  let budgetMode = 'BUDGET_MODE_DYNAMIC_DAILY_BUDGET';
  try {
    let g: { adgroup_id?: string | number };
    try {
      g = await ttCall('POST', 'adgroup/create', auth, { ...adgroupBase, budget_mode: budgetMode });
    } catch (e) {
      if (!(e instanceof TikTokError) || e.code !== 40002 || !/budget/i.test(e.message)) throw e;
      budgetMode = 'BUDGET_MODE_DAY';
      g = await ttCall('POST', 'adgroup/create', auth, { ...adgroupBase, budget_mode: budgetMode });
    }
    if (!g?.adgroup_id) throw new Error('TikTok không trả adgroup_id');
    adgroupId = String(g.adgroup_id);
  } catch (e) {
    throw new TtCreateError(e instanceof Error ? e.message : String(e), 'nhóm quảng cáo', await cleanup());
  }

  // ── 3. Quảng cáo: kéo bài có sẵn (Spark Ads pull) ──
  const withLink = obj.url !== 'none' && !!s.landingPageUrl;
  try {
    const a = await ttCall<{ ad_ids?: (string | number)[]; creatives?: { ad_id?: string | number }[] }>('POST', 'ad/create', auth, {
      advertiser_id: advertiserId,
      adgroup_id: adgroupId,
      creatives: [{
        ad_name: s.campaignName.slice(0, 512),
        identity_type: s.identity.type,
        identity_id: s.identity.id,
        ...(s.identity.bcId ? { identity_authorized_bc_id: s.identity.bcId } : {}),
        ad_format: 'SINGLE_VIDEO',
        tiktok_item_id: s.itemId,
        // Theo dõi kênh: tài liệu bắt KHÔNG gửi nút kêu gọi và link.
        ...(withLink ? { landing_page_url: s.landingPageUrl, call_to_action: s.callToAction ?? 'LEARN_MORE' } : {}),
        operation_status: 'DISABLE',
      }],
    });
    const adId = a?.ad_ids?.[0] ?? a?.creatives?.[0]?.ad_id;
    if (!adId) throw new Error('TikTok không trả ad_id');
    return { campaignId, adgroupId, adId: String(adId), budgetMode };
  } catch (e) {
    throw new TtCreateError(e instanceof Error ? e.message : String(e), 'quảng cáo', await cleanup());
  }
}
