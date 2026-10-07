// Đọc chi tiết một chiến dịch TikTok cho trang Chi tiết chiến dịch. CHỈ ĐỌC.
//
// operation_status (ENABLE/DISABLE) là thứ người dùng bật/tắt; secondary_status
// (…_DELIVERY_OK, …_AUDIT, …_AUDIT_DENY, …_CAMPAIGN_DISABLE…) là thứ TikTok thật
// sự áp dụng. Lý do bị từ chối nằm riêng ở /ad/review_info/.

import { ttCall, ttMoneyToMicros, toCampaign, type TtAuth } from './tiktok';
import type { CampaignDetail, DetailIssue, DetailGroup, DetailAd } from './campaign-detail-types';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Level = 'ok' | 'warn' | 'error' | 'off';

/**
 * secondary_status có hàng chục giá trị và đổi theo thời gian; đoán theo phần
 * đuôi ổn định hơn liệt kê cứng. Giữ nguyên mã gốc để tra khi cần.
 */
function secondary(code: string | undefined): { text: string; level: Level } {
  const c = (code ?? '').toUpperCase();
  if (!c) return { text: '—', level: 'warn' };
  if (c.endsWith('DELIVERY_OK') || c.endsWith('_ENABLE')) return { text: 'Đang phân phối', level: 'ok' };
  if (c.includes('AUDIT_DENY') || c.includes('REVIEW_FAIL')) return { text: 'Bị từ chối khi duyệt', level: 'error' };
  if (c.includes('REAUDIT') || c.endsWith('_AUDIT') || c.includes('UNDER_REVIEW')) return { text: 'Đang chờ TikTok duyệt', level: 'warn' };
  if (c.includes('CAMPAIGN_DISABLE') || c.includes('CAMPAIGN_STATUS_DISABLE')) return { text: 'Không chạy vì chiến dịch đang tạm dừng', level: 'off' };
  if (c.includes('ADGROUP_DISABLE')) return { text: 'Không chạy vì nhóm quảng cáo đang tạm dừng', level: 'off' };
  if (c.includes('BALANCE_EXCEED') || c.includes('BALANCE_INSUFFICIENT')) return { text: 'Hết số dư tài khoản', level: 'error' };
  if (c.includes('BUDGET_EXCEED')) return { text: 'Đã tiêu hết ngân sách', level: 'warn' };
  if (c.includes('NOT_START')) return { text: 'Chưa tới giờ bắt đầu', level: 'warn' };
  if (c.includes('TIME_DONE') || c.includes('_DONE')) return { text: 'Đã kết thúc', level: 'off' };
  if (c.includes('FROZEN')) return { text: 'Bị đóng băng', level: 'error' };
  if (c.includes('DELETE')) return { text: 'Đã xoá', level: 'off' };
  if (c.includes('DISABLE')) return { text: 'Đã tạm dừng', level: 'off' };
  if (c.includes('NOT_DELIVER') || c.includes('LIMIT')) return { text: 'Không phân phối', level: 'error' };
  return { text: c, level: 'warn' };
}

const OBJECTIVE: Record<string, string> = {
  TRAFFIC: 'Lưu lượng truy cập', REACH: 'Phạm vi tiếp cận', VIDEO_VIEWS: 'Lượt xem video',
  ENGAGEMENT: 'Tương tác', LEAD_GENERATION: 'Khách hàng tiềm năng', WEB_CONVERSIONS: 'Chuyển đổi trên web',
  APP_PROMOTION: 'Quảng bá ứng dụng', PRODUCT_SALES: 'Bán sản phẩm', COMMUNITY_INTERACTION: 'Tương tác cộng đồng',
};

const AGE: Record<string, string> = {
  AGE_13_17: '13–17', AGE_18_24: '18–24', AGE_25_34: '25–34', AGE_35_44: '35–44', AGE_45_54: '45–54', AGE_55_100: '55+',
};

function groupSummary(g: Raw): string | null {
  const parts = [
    g.optimization_goal ? `Tối ưu ${String(g.optimization_goal).toLowerCase().replace(/_/g, ' ')}` : null,
    Array.isArray(g.location_ids) && g.location_ids.length ? `${g.location_ids.length} vị trí` : null,
    Array.isArray(g.age_groups) && g.age_groups.length ? `tuổi ${g.age_groups.map((a: string) => AGE[a] ?? a).join(', ')}` : null,
    g.gender === 'GENDER_MALE' ? 'nam' : g.gender === 'GENDER_FEMALE' ? 'nữ' : g.gender ? 'mọi giới tính' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export async function tiktokCampaignDetail(
  token: TtAuth, advertiserId: string, campaignId: string, currency: string,
): Promise<CampaignDetail> {
  const partialErrors: string[] = [];
  const safe = async <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch (e) { partialErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); return fallback; }
  };

  const c = await ttCall<{ list?: Raw[] }>('GET', 'campaign/get', token, {
    advertiser_id: advertiserId,
    filtering: { campaign_ids: [campaignId] },
    fields: ['campaign_id', 'campaign_name', 'objective_type', 'operation_status', 'secondary_status',
      'budget', 'budget_mode', 'create_time'],
  });
  const raw = c.list?.[0];
  if (!raw) throw new Error('Không tìm thấy chiến dịch trên TikTok — có thể đã bị xoá');
  const camp = toCampaign(raw);

  const [groups, ads] = await Promise.all([
    safe('Nhóm quảng cáo', ttCall<{ list?: Raw[] }>('GET', 'adgroup/get', token, {
      advertiser_id: advertiserId, page_size: 1000,
      filtering: { campaign_ids: [campaignId] },
      fields: ['adgroup_id', 'adgroup_name', 'operation_status', 'secondary_status', 'budget', 'budget_mode',
        'optimization_goal', 'location_ids', 'age_groups', 'gender', 'schedule_start_time', 'schedule_end_time'],
    }).then((d) => d.list ?? []), [] as Raw[]),
    safe('Quảng cáo', ttCall<{ list?: Raw[] }>('GET', 'ad/get', token, {
      advertiser_id: advertiserId, page_size: 1000,
      filtering: { campaign_ids: [campaignId] },
      fields: ['ad_id', 'adgroup_id', 'ad_name', 'operation_status', 'secondary_status', 'ad_text', 'ad_texts',
        'display_name', 'landing_page_url', 'call_to_action', 'video_id', 'tiktok_item_id'],
    }).then((d) => d.list ?? []), [] as Raw[]),
  ]);

  // Lý do từ chối: endpoint riêng, tối đa 100 ID mỗi lần.
  const review = new Map<string, Raw>();
  const adIds = ads.map((a) => String(a.ad_id));
  for (let i = 0; i < adIds.length; i += 100) {
    const d = await safe('Kết quả duyệt', ttCall<{ ad_review_map?: Record<string, Raw>; list?: Raw[] }>('GET', 'ad/review_info', token, {
      advertiser_id: advertiserId, ad_ids: adIds.slice(i, i + 100),
    }), {} as { ad_review_map?: Record<string, Raw>; list?: Raw[] });
    // Tài liệu không thống nhất dạng trả về — nhận cả map lẫn list.
    for (const [k, v] of Object.entries(d.ad_review_map ?? {})) review.set(k, v);
    for (const v of d.list ?? []) if (v.ad_id) review.set(String(v.ad_id), v);
  }

  const cbo = camp.budgetMode !== 'BUDGET_MODE_INFINITE';
  const detailGroups: DetailGroup[] = groups.map((g) => {
    const s = secondary(g.secondary_status);
    const dailyGroup = g.budget_mode === 'BUDGET_MODE_DAY' || g.budget_mode === 'BUDGET_MODE_DYNAMIC_DAILY_BUDGET';
    return {
      id: String(g.adgroup_id), name: g.adgroup_name ?? String(g.adgroup_id), kind: 'adset',
      enabled: g.operation_status === 'ENABLE', rawStatus: g.operation_status ?? '',
      serving: s.text, servingLevel: s.level,
      issues: s.level === 'ok' ? [] : [{ code: g.secondary_status ?? '', text: s.text, level: s.level === 'error' ? 'error' : 'info' } as DetailIssue],
      // Bật CBO thì TikTok trả budget 0 cho nhóm — không có gì để sửa ở nhóm.
      dailyBudgetMicros: !cbo && dailyGroup && Number(g.budget) > 0 ? ttMoneyToMicros(g.budget) : null,
      summary: groupSummary(g),
    };
  });

  const detailAds: DetailAd[] = ads.map((a) => {
    const s = secondary(a.secondary_status);
    const r = review.get(String(a.ad_id));
    const reasons = (r?.reject_info ?? []).flatMap((x: Raw) => x.reasons ?? []).filter(Boolean);
    const reviewText = r
      ? (r.is_approved === true || r.review_status === 'ALL_AVAILABLE') ? 'Đã duyệt'
        : r.review_status === 'PART_AVAILABLE' ? 'Duyệt một phần'
          : reasons.length ? `Bị từ chối: ${reasons.join('; ')}` : 'Chưa được duyệt'
      : s.text === 'Đang chờ TikTok duyệt' ? 'Đang xem xét' : null;
    const texts: string[] = Array.isArray(a.ad_texts) && a.ad_texts.length ? a.ad_texts : a.ad_text ? [a.ad_text] : [];
    return {
      id: String(a.ad_id), groupId: String(a.adgroup_id), name: a.ad_name ?? String(a.ad_id),
      enabled: a.operation_status === 'ENABLE', rawStatus: a.operation_status ?? '',
      serving: s.text, servingLevel: s.level,
      issues: s.level === 'ok' ? [] : [{ code: a.secondary_status ?? '', text: s.text, level: s.level === 'error' ? 'error' : 'info' } as DetailIssue],
      review: reviewText,
      headlines: a.display_name ? [a.display_name] : [],
      descriptions: texts,
      finalUrl: a.landing_page_url ?? null,
      thumbnail: null,
      type: a.tiktok_item_id ? 'Spark Ads (bài đăng TikTok)' : 'Quảng cáo video TikTok',
    };
  });

  const s = secondary(raw.secondary_status);
  const daily = camp.budgetMode === 'BUDGET_MODE_DAY' || camp.budgetMode === 'BUDGET_MODE_DYNAMIC_DAILY_BUDGET';
  return {
    platform: 'tiktok',
    externalId: campaignId,
    currency,
    campaign: {
      name: camp.name,
      enabled: camp.operationStatus === 'ENABLE',
      rawStatus: camp.operationStatus,
      serving: camp.operationStatus === 'DISABLE' ? 'Đã tạm dừng' : s.text,
      servingLevel: camp.operationStatus === 'DISABLE' ? 'off' : s.level,
      issues: s.level === 'ok' || camp.operationStatus === 'DISABLE' ? [] : [{ code: raw.secondary_status ?? '', text: s.text, level: 'info' }],
      type: OBJECTIVE[camp.objective] ?? camp.objective,
      bidding: null,
      dailyBudgetMicros: daily ? camp.budgetMicros : null,
      lifetimeBudgetMicros: camp.budgetMode === 'BUDGET_MODE_TOTAL' ? camp.budgetMicros : null,
      budgetLevel: cbo ? 'campaign' : detailGroups.some((g) => g.dailyBudgetMicros) ? 'group' : 'none',
      budgetShared: false,
      // create_time là UTC "YYYY-MM-DD HH:MM:SS" — gắn Z để hiển thị đúng giờ địa phương.
      start: camp.createTime ? `${camp.createTime.replace(' ', 'T')}Z` : null,
      end: null,
      nativeUrl: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${advertiserId}`,
    },
    locations: [],
    languages: [],
    groups: detailGroups,
    ads: detailAds,
    keywords: [],
    partialErrors,
    can: {
      rename: true,
      status: true,
      budget: daily,
      groupStatus: true,
      groupBudget: !cbo,
      adStatus: true,
      locations: false,
      keywords: false,
    },
  };
}
