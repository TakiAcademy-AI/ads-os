// Đọc chi tiết một chiến dịch Facebook cho trang Chi tiết chiến dịch. CHỈ ĐỌC.
//
// `status` là thứ người dùng bật/tắt; `effective_status` là thứ Facebook thật
// sự áp dụng (CAMPAIGN_PAUSED, PENDING_REVIEW, DISAPPROVED, WITH_ISSUES…). Lý do
// cụ thể nằm ở issues_info và ad_review_feedback — phải đọc cả hai mới biết
// vì sao một quảng cáo "đang bật" mà không chạy.

import { fbGet, fbGetAll } from './facebook';
import { minorToMicros } from './currency';
import type {
  CampaignDetail, DetailIssue, DetailGroup, DetailAd,
} from './campaign-detail-types';

const EFFECTIVE: Record<string, { text: string; level: 'ok' | 'warn' | 'error' | 'off' }> = {
  ACTIVE: { text: 'Đang chạy', level: 'ok' },
  PAUSED: { text: 'Đã tạm dừng', level: 'off' },
  CAMPAIGN_PAUSED: { text: 'Không chạy vì chiến dịch đang tạm dừng', level: 'off' },
  ADSET_PAUSED: { text: 'Không chạy vì nhóm quảng cáo đang tạm dừng', level: 'off' },
  PENDING_REVIEW: { text: 'Đang chờ Facebook duyệt', level: 'warn' },
  IN_PROCESS: { text: 'Đang xử lý', level: 'warn' },
  PREAPPROVED: { text: 'Đã duyệt sơ bộ', level: 'warn' },
  DISAPPROVED: { text: 'Bị từ chối', level: 'error' },
  WITH_ISSUES: { text: 'Có vấn đề cần xử lý', level: 'error' },
  PENDING_BILLING_INFO: { text: 'Thiếu thông tin thanh toán', level: 'error' },
  ARCHIVED: { text: 'Đã lưu trữ', level: 'off' },
  DELETED: { text: 'Đã xoá', level: 'off' },
};

const OBJECTIVE: Record<string, string> = {
  OUTCOME_ENGAGEMENT: 'Tương tác', OUTCOME_LEADS: 'Khách hàng tiềm năng', OUTCOME_SALES: 'Doanh số',
  OUTCOME_TRAFFIC: 'Lưu lượng truy cập', OUTCOME_AWARENESS: 'Nhận biết', OUTCOME_APP_PROMOTION: 'Quảng bá ứng dụng',
  MESSAGES: 'Tin nhắn', CONVERSIONS: 'Chuyển đổi', LINK_CLICKS: 'Lượt nhấp', POST_ENGAGEMENT: 'Tương tác bài viết',
  REACH: 'Phạm vi tiếp cận', BRAND_AWARENESS: 'Nhận biết thương hiệu', LEAD_GENERATION: 'Khách hàng tiềm năng',
  VIDEO_VIEWS: 'Lượt xem video',
};

const BID: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: 'Chi phí thấp nhất', LOWEST_COST_WITH_BID_CAP: 'Giới hạn giá thầu',
  COST_CAP: 'Giới hạn chi phí', LOWEST_COST_WITH_MIN_ROAS: 'ROAS tối thiểu',
};

const OPT_GOAL: Record<string, string> = {
  POST_ENGAGEMENT: 'tương tác bài viết', CONVERSATIONS: 'cuộc trò chuyện', LEAD_GENERATION: 'khách tiềm năng',
  OFFSITE_CONVERSIONS: 'chuyển đổi trên web', LINK_CLICKS: 'lượt nhấp', LANDING_PAGE_VIEWS: 'xem trang đích',
  REACH: 'tiếp cận', IMPRESSIONS: 'hiển thị', THRUPLAY: 'ThruPlay', VALUE: 'giá trị', QUALITY_LEAD: 'khách chất lượng',
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function issuesOf(info?: Row[]): DetailIssue[] {
  return (info ?? []).map((i) => ({
    code: String(i.error_code ?? i.level ?? ''),
    text: i.error_summary ? `${i.error_summary}${i.error_message ? ` — ${i.error_message}` : ''}` : (i.error_message ?? 'Có vấn đề'),
    level: i.level === 'AD_SET' || i.level === 'CAMPAIGN' || i.level === 'AD' ? 'error' : 'warn',
  }));
}

function reviewOf(effective: string, fb?: Row): string | null {
  const global = fb?.global ? Object.values(fb.global as Record<string, string>) : [];
  if (global.length) return `Bị từ chối: ${global.join('; ')}`;
  if (effective === 'DISAPPROVED') return 'Bị từ chối';
  if (effective === 'PENDING_REVIEW' || effective === 'IN_PROCESS') return 'Đang xem xét';
  if (effective === 'PREAPPROVED') return 'Đã duyệt sơ bộ';
  return 'Đã duyệt';
}

function targetingSummary(t?: Row): string | null {
  if (!t) return null;
  const g = t.geo_locations ?? {};
  const places = [
    ...(g.countries ?? []),
    ...((g.regions ?? []) as Row[]).map((r) => r.name),
    ...((g.cities ?? []) as Row[]).map((c) => c.name),
  ];
  const gender = (t.genders ?? []).length === 1 ? (t.genders[0] === 1 ? 'nam' : 'nữ') : 'mọi giới tính';
  return [
    places.length ? places.join(', ') : null,
    t.age_min || t.age_max ? `${t.age_min ?? 18}–${t.age_max ?? 65}${t.age_max === 65 ? '+' : ''} tuổi` : null,
    gender,
  ].filter(Boolean).join(' · ');
}

const status = (eff: string) => EFFECTIVE[eff] ?? { text: eff, level: 'warn' as const };

export async function facebookCampaignDetail(
  token: string, actId: string, campaignId: string, currency: string,
): Promise<CampaignDetail> {
  const partialErrors: string[] = [];
  const money = (v?: string) => (v && Number(v) > 0 ? minorToMicros(v, currency) : null);

  const c = await fbGet<Row>(`/${campaignId}`, {
    fields: 'name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,issues_info',
  }, token);

  const [adsets, ads] = await Promise.all([
    fbGetAll<Row>(`/${campaignId}/adsets`, {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,targeting{geo_locations,age_min,age_max,genders},issues_info',
    }, token).catch((e) => { partialErrors.push(`Nhóm quảng cáo: ${e.message}`); return [] as Row[]; }),
    fbGetAll<Row>(`/${campaignId}/ads`, {
      fields: 'id,name,status,effective_status,adset_id,ad_review_feedback,issues_info,creative{thumbnail_url,image_url,title,body,object_story_spec,link_url}',
    }, token).catch((e) => { partialErrors.push(`Quảng cáo: ${e.message}`); return [] as Row[]; }),
  ]);

  const groups: DetailGroup[] = adsets.map((a) => {
    const s = status(a.effective_status);
    const goal = OPT_GOAL[a.optimization_goal] ?? a.optimization_goal;
    return {
      id: a.id, name: a.name, kind: 'adset',
      enabled: a.status === 'ACTIVE', rawStatus: a.status,
      serving: s.text, servingLevel: s.level, issues: issuesOf(a.issues_info),
      dailyBudgetMicros: money(a.daily_budget),
      summary: [goal ? `Tối ưu ${goal}` : null, targetingSummary(a.targeting)].filter(Boolean).join(' · ') || null,
    };
  });

  const detailAds: DetailAd[] = ads.map((a) => {
    const s = status(a.effective_status);
    const cr = a.creative ?? {};
    const story = cr.object_story_spec ?? {};
    const link = story.link_data ?? story.video_data ?? {};
    return {
      id: a.id, groupId: a.adset_id, name: a.name,
      enabled: a.status === 'ACTIVE', rawStatus: a.status,
      serving: s.text, servingLevel: s.level, issues: issuesOf(a.issues_info),
      review: reviewOf(a.effective_status, a.ad_review_feedback),
      headlines: [cr.title ?? link.name ?? link.title].filter(Boolean),
      descriptions: [cr.body ?? link.message].filter(Boolean),
      finalUrl: link.link ?? cr.link_url ?? null,
      thumbnail: cr.thumbnail_url ?? cr.image_url ?? null,
      type: 'Quảng cáo Facebook',
    };
  });

  const s = status(c.effective_status);
  const daily = money(c.daily_budget);
  const lifetime = money(c.lifetime_budget);
  const cbo = daily !== null || lifetime !== null;
  const act = actId.replace(/^act_/, '');
  return {
    platform: 'facebook',
    externalId: campaignId,
    currency,
    campaign: {
      name: c.name,
      enabled: c.status === 'ACTIVE',
      rawStatus: c.status,
      serving: s.text,
      servingLevel: s.level,
      issues: issuesOf(c.issues_info),
      type: OBJECTIVE[c.objective] ?? c.objective ?? '—',
      bidding: BID[c.bid_strategy] ?? c.bid_strategy ?? null,
      dailyBudgetMicros: daily,
      lifetimeBudgetMicros: lifetime,
      // Ngân sách ở chiến dịch (CBO) hoặc ở từng nhóm (ABO) — sửa ở đúng chỗ đó.
      budgetLevel: cbo ? 'campaign' : groups.some((g) => g.dailyBudgetMicros) ? 'group' : 'none',
      budgetShared: false,
      start: c.start_time ?? null,
      end: c.stop_time ?? null,
      nativeUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}&selected_campaign_ids=${campaignId}`,
    },
    locations: [],
    languages: [],
    groups,
    ads: detailAds,
    keywords: [],
    partialErrors,
    can: {
      rename: true,
      status: true,
      budget: daily !== null,
      groupStatus: true,
      groupBudget: !cbo,
      adStatus: true,
      locations: false,
      keywords: false,
    },
  };
}
