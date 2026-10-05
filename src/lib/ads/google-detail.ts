// Đọc chi tiết một chiến dịch Google Ads cho trang Chi tiết chiến dịch. CHỈ ĐỌC.
//
// Trạng thái lấy từ primary_status + primary_status_reasons — đó chính là thứ
// giao diện Google Ads hiện thành "Đủ điều kiện", "Không đủ điều kiện"… kèm lý
// do. Đọc campaign.status trơn thì chỉ biết người dùng bật hay tắt, không biết
// vì sao quảng cáo không chạy.

import { gaql, type GoogleAuth } from './google';
import type {
  CampaignDetail, DetailIssue, DetailGroup, DetailAd, DetailKeyword, DetailLocation,
} from './campaign-detail-types';

const PRIMARY: Record<string, { text: string; level: 'ok' | 'warn' | 'error' | 'off' }> = {
  ELIGIBLE: { text: 'Đủ điều kiện — đang được phân phối', level: 'ok' },
  PAUSED: { text: 'Đã tạm dừng', level: 'off' },
  REMOVED: { text: 'Đã xoá', level: 'off' },
  ENDED: { text: 'Đã kết thúc', level: 'off' },
  PENDING: { text: 'Chưa tới ngày bắt đầu', level: 'warn' },
  MISCONFIGURED: { text: 'Cấu hình sai — không chạy được', level: 'error' },
  LIMITED: { text: 'Bị giới hạn', level: 'warn' },
  LEARNING: { text: 'Đang học', level: 'warn' },
  NOT_ELIGIBLE: { text: 'Không đủ điều kiện', level: 'error' },
};

/** Lý do trạng thái — các mã hay gặp. Mã lạ vẫn hiện nguyên văn. */
const REASON: Record<string, [string, DetailIssue['level']]> = {
  CAMPAIGN_PAUSED: ['Chiến dịch đang tạm dừng', 'info'],
  CAMPAIGN_REMOVED: ['Chiến dịch đã bị xoá', 'error'],
  CAMPAIGN_ENDED: ['Chiến dịch đã qua ngày kết thúc', 'warn'],
  CAMPAIGN_PENDING: ['Chưa tới ngày bắt đầu', 'info'],
  CAMPAIGN_DRAFT: ['Chiến dịch còn là bản nháp', 'warn'],
  BIDDING_STRATEGY_LEARNING: ['Chiến lược giá thầu đang trong giai đoạn học', 'info'],
  BIDDING_STRATEGY_LIMITED: ['Chiến lược giá thầu bị giới hạn', 'warn'],
  BIDDING_STRATEGY_MISCONFIGURED: ['Chiến lược giá thầu cấu hình sai', 'error'],
  BIDDING_STRATEGY_CONSTRAINED: ['Chiến lược giá thầu bị ràng buộc', 'warn'],
  BUDGET_CONSTRAINED: ['Bị giới hạn bởi ngân sách — tăng ngân sách để hiển thị nhiều hơn', 'warn'],
  MISSING_INVOICE_SETUP: ['Chưa thiết lập thanh toán', 'error'],
  HAS_ADS_LIMITED_BY_POLICY: ['Có quảng cáo bị giới hạn bởi chính sách', 'warn'],
  HAS_ADS_DISAPPROVED: ['Có quảng cáo bị từ chối', 'error'],
  MOST_ADS_UNDER_REVIEW: ['Phần lớn quảng cáo đang chờ Google duyệt', 'info'],
  ALL_ADS_DISAPPROVED: ['Tất cả quảng cáo bị từ chối', 'error'],
  NO_ADS: ['Chưa có quảng cáo nào', 'error'],
  AD_GROUP_PAUSED: ['Nhóm quảng cáo đang tạm dừng', 'info'],
  AD_GROUP_REMOVED: ['Nhóm quảng cáo đã bị xoá', 'error'],
  AD_GROUP_INCOMPLETE: ['Nhóm quảng cáo thiếu thành phần bắt buộc', 'error'],
  HAS_NO_ACTIVE_ADS: ['Không có quảng cáo nào đang bật', 'error'],
  AD_GROUP_AD_PAUSED: ['Quảng cáo đang tạm dừng', 'info'],
  AD_GROUP_AD_REMOVED: ['Quảng cáo đã bị xoá', 'error'],
  AD_GROUP_AD_DISAPPROVED: ['Quảng cáo bị từ chối', 'error'],
  AD_GROUP_AD_UNDER_REVIEW: ['Quảng cáo đang chờ Google duyệt (thường trong 1 ngày làm việc)', 'info'],
  AD_GROUP_AD_POOR_QUALITY: ['Quảng cáo chất lượng thấp', 'warn'],
  AD_GROUP_AD_NO_ADS: ['Chưa có quảng cáo', 'error'],
  AD_GROUP_AD_APPROVED_LABEL: ['Quảng cáo đã duyệt kèm giới hạn', 'warn'],
  AD_GROUP_AD_AREA_OF_INTEREST_ONLY: ['Chỉ hiển thị ở khu vực quan tâm', 'warn'],
  AD_GROUP_AD_UNDER_APPEAL: ['Quảng cáo đang kháng nghị', 'info'],
  ASSET_GROUP_PAUSED: ['Nhóm tài sản đang tạm dừng', 'info'],
  ASSET_GROUP_REMOVED: ['Nhóm tài sản đã bị xoá', 'error'],
  ASSET_GROUP_UNDER_REVIEW: ['Nhóm tài sản đang chờ Google duyệt', 'info'],
  ASSET_GROUP_DISAPPROVED: ['Nhóm tài sản bị từ chối', 'error'],
  ASSET_GROUP_LIMITED: ['Nhóm tài sản bị giới hạn', 'warn'],
  KEYWORD_PAUSED: ['Từ khoá đang tạm dừng', 'info'],
  KEYWORD_DISAPPROVED: ['Từ khoá bị từ chối', 'error'],
  KEYWORD_UNDER_REVIEW: ['Từ khoá đang chờ duyệt', 'info'],
  KEYWORD_LOW_SEARCH_VOLUME: ['Từ khoá có ít lượt tìm kiếm', 'warn'],
};

const issues = (codes: string[] | undefined): DetailIssue[] =>
  (codes ?? []).map((c) => {
    const r = REASON[c];
    return { code: c, text: r?.[0] ?? c, level: r?.[1] ?? 'warn' };
  });

const TYPE: Record<string, string> = {
  SEARCH: 'Tìm kiếm', DISPLAY: 'Hiển thị', PERFORMANCE_MAX: 'Performance Max',
  DEMAND_GEN: 'Demand Gen', VIDEO: 'Video', SHOPPING: 'Mua sắm', MULTI_CHANNEL: 'Ứng dụng',
  SMART: 'Thông minh', LOCAL: 'Địa phương', HOTEL: 'Khách sạn', TRAVEL: 'Du lịch',
};

const BIDDING: Record<string, string> = {
  TARGET_SPEND: 'Tối đa lượt nhấp', MAXIMIZE_CONVERSIONS: 'Tối đa chuyển đổi',
  MAXIMIZE_CONVERSION_VALUE: 'Tối đa giá trị chuyển đổi', TARGET_CPA: 'CPA mục tiêu',
  TARGET_ROAS: 'ROAS mục tiêu', MANUAL_CPC: 'CPC thủ công', MANUAL_CPM: 'CPM thủ công',
  TARGET_IMPRESSION_SHARE: 'Tỷ lệ hiển thị mục tiêu', TARGET_CPM: 'CPM mục tiêu',
  MANUAL_CPV: 'CPV thủ công', ENHANCED_CPC: 'CPC nâng cao',
};

const APPROVAL: Record<string, string> = {
  APPROVED: 'Đã duyệt', APPROVED_LIMITED: 'Đã duyệt (có giới hạn)', DISAPPROVED: 'Bị từ chối',
  AREA_OF_INTEREST_ONLY: 'Chỉ khu vực quan tâm', UNKNOWN: 'Chưa có kết quả',
};
const REVIEW: Record<string, string> = {
  REVIEW_IN_PROGRESS: 'Đang xem xét', REVIEWED: 'Đã xem xét', UNDER_APPEAL: 'Đang kháng nghị',
  ELIGIBLE_MAY_SERVE: 'Có thể chạy trong lúc chờ duyệt',
};

function reviewText(p?: {
  approvalStatus?: string; reviewStatus?: string; policyTopicEntries?: { topic?: string; type?: string }[];
}): string | null {
  if (!p) return null;
  if (p.reviewStatus === 'REVIEW_IN_PROGRESS' || p.approvalStatus === 'UNKNOWN') {
    return REVIEW[p.reviewStatus ?? ''] ?? 'Đang xem xét';
  }
  const base = APPROVAL[p.approvalStatus ?? ''] ?? p.approvalStatus ?? null;
  const topics = (p.policyTopicEntries ?? []).map((t) => t.topic).filter(Boolean);
  return topics.length ? `${base}: ${topics.join(', ')}` : base;
}

const serving = (primary?: string) => PRIMARY[primary ?? ''] ?? { text: primary ?? '—', level: 'warn' as const };

/**
 * Nhóm/quảng cáo bên trong một chiến dịch đang tạm dừng: Google trả primary
 * status lung tung (nhóm quảng cáo ra PENDING — "chưa tới ngày bắt đầu" — dù
 * ngày bắt đầu đã qua). Lý do thật nằm ở CAMPAIGN_PAUSED, nói thẳng điều đó.
 */
function childServing(primary: string | undefined, reasons: string[] | undefined) {
  if ((reasons ?? []).includes('CAMPAIGN_PAUSED')) {
    return { text: 'Không chạy vì chiến dịch đang tạm dừng', level: 'off' as const };
  }
  return serving(primary);
}

const LANG_VI: Record<string, string> = { '1040': 'Tiếng Việt', '1000': 'Tiếng Anh' };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function googleCampaignDetail(
  auth: GoogleAuth, customerId: string, campaignId: string, currency: string,
): Promise<CampaignDetail> {
  const cid = campaignId.replace(/\D/g, '');
  const partialErrors: string[] = [];
  const safe = async (label: string, q: string): Promise<Row[]> => {
    try { return await gaql<Row>(auth, customerId, q); } catch (e) {
      partialErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  };

  const [camp] = await gaql<Row>(auth, customerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status,
            campaign.primary_status_reasons, campaign.advertising_channel_type,
            campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time,
            campaign_budget.amount_micros, campaign_budget.explicitly_shared,
            campaign_budget.reference_count, campaign_budget.period
     FROM campaign WHERE campaign.id = ${cid}`);
  if (!camp) throw new Error('Không tìm thấy chiến dịch trên Google Ads — có thể đã bị xoá');
  const c = camp.campaign ?? {};
  const kind: string = c.advertisingChannelType ?? '';
  const isPmax = kind === 'PERFORMANCE_MAX';

  const [crit, agCrit, groups, ads, kws] = await Promise.all([
    safe('Vị trí/ngôn ngữ', `SELECT campaign_criterion.criterion_id, campaign_criterion.type,
            campaign_criterion.negative, campaign_criterion.location.geo_target_constant,
            campaign_criterion.language.language_constant
       FROM campaign_criterion
       WHERE campaign.id = ${cid} AND campaign_criterion.type IN ('LOCATION', 'LANGUAGE')`),
    // Demand Gen đặt vị trí/ngôn ngữ ở cấp nhóm quảng cáo.
    kind === 'DEMAND_GEN'
      ? safe('Vị trí nhóm', `SELECT ad_group_criterion.criterion_id, ad_group.id, ad_group_criterion.type,
            ad_group_criterion.negative, ad_group_criterion.location.geo_target_constant,
            ad_group_criterion.language.language_constant
         FROM ad_group_criterion
         WHERE campaign.id = ${cid} AND ad_group_criterion.type IN ('LOCATION', 'LANGUAGE')`)
      : Promise.resolve([]),
    isPmax
      ? safe('Nhóm tài sản', `SELECT asset_group.id, asset_group.name, asset_group.status,
            asset_group.primary_status, asset_group.primary_status_reasons
         FROM asset_group WHERE campaign.id = ${cid} AND asset_group.status != 'REMOVED'`)
      : safe('Nhóm quảng cáo', `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type,
            ad_group.primary_status, ad_group.primary_status_reasons
         FROM ad_group WHERE campaign.id = ${cid} AND ad_group.status != 'REMOVED'`),
    isPmax
      ? safe('Tài sản', `SELECT asset_group.id, asset_group_asset.field_type, asset_group_asset.status,
            asset.text_asset.text, asset.image_asset.full_size.url, asset_group_asset.policy_summary.approval_status,
            asset_group_asset.policy_summary.review_status
         FROM asset_group_asset
         WHERE campaign.id = ${cid} AND asset_group_asset.status != 'REMOVED'`)
      : safe('Quảng cáo', `SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
            ad_group_ad.status, ad_group_ad.primary_status, ad_group_ad.primary_status_reasons,
            ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status,
            ad_group_ad.policy_summary.policy_topic_entries, ad_group_ad.ad.final_urls,
            ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
            ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline,
            ad_group_ad.ad.responsive_display_ad.descriptions,
            ad_group_ad.ad.demand_gen_multi_asset_ad.headlines, ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions
         FROM ad_group_ad WHERE campaign.id = ${cid} AND ad_group_ad.status != 'REMOVED'`),
    kind === 'SEARCH'
      ? safe('Từ khoá', `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type, ad_group_criterion.status,
            ad_group_criterion.approval_status
         FROM ad_group_criterion
         WHERE campaign.id = ${cid} AND ad_group_criterion.type = 'KEYWORD'
           AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.negative = FALSE`)
      : Promise.resolve([]),
  ]);

  // Tên vị trí và ngôn ngữ: criterion chỉ giữ resource name, phải tra riêng.
  const allCrit = [
    ...crit.map((r) => ({ ...r.campaignCriterion, level: 'campaign' as const })),
    ...agCrit.map((r) => ({ ...r.adGroupCriterion, level: 'group' as const })),
  ];
  const geoRns = [...new Set(allCrit.map((x) => x.location?.geoTargetConstant).filter(Boolean))];
  const langRns = [...new Set(allCrit.map((x) => x.language?.languageConstant).filter(Boolean))];
  const geoNames = new Map<string, string>();
  const langNames = new Map<string, string>();
  if (geoRns.length) {
    const rows = await safe('Tên vị trí', `SELECT geo_target_constant.resource_name, geo_target_constant.name,
        geo_target_constant.canonical_name FROM geo_target_constant
      WHERE geo_target_constant.resource_name IN (${geoRns.map((r) => `'${r}'`).join(',')})`);
    for (const r of rows) {
      const g = r.geoTargetConstant;
      geoNames.set(g.resourceName, g.canonicalName && g.canonicalName !== g.name ? `${g.name} (${g.canonicalName})` : g.name);
    }
  }
  if (langRns.length) {
    const rows = await safe('Tên ngôn ngữ', `SELECT language_constant.resource_name, language_constant.name
      FROM language_constant
      WHERE language_constant.resource_name IN (${langRns.map((r) => `'${r}'`).join(',')})`);
    for (const r of rows) langNames.set(r.languageConstant.resourceName, r.languageConstant.name);
  }

  const locations: DetailLocation[] = allCrit.filter((x) => x.location?.geoTargetConstant).map((x) => ({
    criterionId: String(x.criterionId),
    geoId: String(x.location.geoTargetConstant).split('/').pop()!,
    name: geoNames.get(x.location.geoTargetConstant) ?? x.location.geoTargetConstant,
    negative: x.negative === true,
    level: x.level,
  }));
  const seenLang = new Set<string>();
  const languages = allCrit.filter((x) => x.language?.languageConstant).flatMap((x) => {
    const id = String(x.language.languageConstant).split('/').pop()!;
    if (seenLang.has(id)) return [];
    seenLang.add(id);
    return [{ criterionId: String(x.criterionId), id, name: LANG_VI[id] ?? langNames.get(x.language.languageConstant) ?? id }];
  });

  const detailGroups: DetailGroup[] = groups.map((r) => {
    const g = isPmax ? r.assetGroup : r.adGroup;
    const s = childServing(g.primaryStatus, g.primaryStatusReasons);
    return {
      id: String(g.id), name: g.name, kind: isPmax ? 'asset_group' : 'ad_group',
      enabled: g.status === 'ENABLED', rawStatus: g.status,
      serving: s.text, servingLevel: s.level, issues: issues(g.primaryStatusReasons),
      dailyBudgetMicros: null, summary: null,
    };
  });

  let detailAds: DetailAd[];
  if (isPmax) {
    // PMax không có "quảng cáo" — gom tài sản theo nhóm thành một thẻ xem trước.
    const byGroup = new Map<string, Row[]>();
    for (const r of ads) {
      const id = String(r.assetGroup.id);
      byGroup.set(id, [...(byGroup.get(id) ?? []), r]);
    }
    detailAds = [...byGroup].map(([gid, rows]) => {
      const pick = (ft: string) => rows.filter((r) => r.assetGroupAsset.fieldType === ft)
        .map((r) => r.asset?.textAsset?.text).filter(Boolean) as string[];
      const pending = rows.some((r) => r.assetGroupAsset.policySummary?.reviewStatus === 'REVIEW_IN_PROGRESS');
      const denied = rows.filter((r) => r.assetGroupAsset.policySummary?.approvalStatus === 'DISAPPROVED').length;
      const group = detailGroups.find((g) => g.id === gid);
      return {
        id: `ag-${gid}`, groupId: gid, name: `Tài sản của ${group?.name ?? gid}`,
        enabled: group?.enabled ?? true, rawStatus: group?.rawStatus ?? '',
        serving: group?.serving ?? '', servingLevel: group?.servingLevel ?? 'warn', issues: [],
        review: denied ? `${denied} tài sản bị từ chối` : pending ? 'Đang xem xét' : 'Đã duyệt',
        headlines: [...pick('HEADLINE'), ...pick('LONG_HEADLINE')],
        descriptions: pick('DESCRIPTION'),
        finalUrl: null,
        thumbnail: rows.find((r) => r.asset?.imageAsset?.fullSize?.url)?.asset.imageAsset.fullSize.url ?? null,
        type: 'Nhóm tài sản Performance Max',
      };
    });
  } else {
    detailAds = ads.map((r) => {
      const a = r.adGroupAd;
      const ad = a.ad ?? {};
      const rsa = ad.responsiveSearchAd, rda = ad.responsiveDisplayAd, dg = ad.demandGenMultiAssetAd;
      const texts = (xs?: { text?: string }[]) => (xs ?? []).map((x) => x.text ?? '').filter(Boolean);
      const s = childServing(a.primaryStatus, a.primaryStatusReasons);
      return {
        id: String(ad.id), groupId: String(r.adGroup.id), name: ad.name || `Quảng cáo ${ad.id}`,
        enabled: a.status === 'ENABLED', rawStatus: a.status,
        serving: s.text, servingLevel: s.level, issues: issues(a.primaryStatusReasons),
        review: reviewText(a.policySummary),
        headlines: [...texts(rsa?.headlines ?? rda?.headlines ?? dg?.headlines),
          ...(rda?.longHeadline?.text ? [rda.longHeadline.text] : [])],
        descriptions: texts(rsa?.descriptions ?? rda?.descriptions ?? dg?.descriptions),
        finalUrl: ad.finalUrls?.[0] ?? null,
        thumbnail: null,
        type: ({ RESPONSIVE_SEARCH_AD: 'Quảng cáo tìm kiếm thích ứng', RESPONSIVE_DISPLAY_AD: 'Quảng cáo hiển thị thích ứng',
          DEMAND_GEN_MULTI_ASSET_AD: 'Quảng cáo Demand Gen nhiều tài sản' } as Record<string, string>)[ad.type] ?? ad.type,
      };
    });
  }

  const keywords: DetailKeyword[] = kws.map((r) => ({
    criterionId: String(r.adGroupCriterion.criterionId),
    groupId: String(r.adGroup.id),
    text: r.adGroupCriterion.keyword?.text ?? '',
    matchType: r.adGroupCriterion.keyword?.matchType ?? '',
    enabled: r.adGroupCriterion.status === 'ENABLED',
    review: APPROVAL[r.adGroupCriterion.approvalStatus ?? ''] ?? r.adGroupCriterion.approvalStatus ?? null,
  }));

  const s = serving(c.primaryStatus);
  const shared = camp.campaignBudget?.explicitlyShared === true || Number(camp.campaignBudget?.referenceCount ?? 1) > 1;
  const daily = camp.campaignBudget?.period !== 'CUSTOM_PERIOD';
  return {
    platform: 'google',
    externalId: cid,
    currency,
    campaign: {
      name: c.name,
      enabled: c.status === 'ENABLED',
      rawStatus: c.status,
      serving: s.text,
      servingLevel: s.level,
      issues: issues(c.primaryStatusReasons),
      type: TYPE[kind] ?? kind,
      bidding: BIDDING[c.biddingStrategyType] ?? c.biddingStrategyType ?? null,
      dailyBudgetMicros: daily && camp.campaignBudget?.amountMicros ? Number(camp.campaignBudget.amountMicros) : null,
      lifetimeBudgetMicros: !daily && camp.campaignBudget?.amountMicros ? Number(camp.campaignBudget.amountMicros) : null,
      budgetLevel: 'campaign',
      budgetShared: shared,
      start: c.startDateTime ?? null,
      end: c.endDateTime ?? null,
      nativeUrl: `https://ads.google.com/aw/adgroups?campaignId=${cid}&__e=${customerId.replace(/\D/g, '')}`,
    },
    locations,
    languages,
    groups: detailGroups,
    ads: detailAds,
    keywords,
    partialErrors,
    can: {
      rename: true,
      status: true,
      budget: daily && !shared,
      groupStatus: true,
      groupBudget: false,
      adStatus: !isPmax,
      // Demand Gen đặt vị trí ở từng nhóm — chưa hỗ trợ sửa ở đó.
      locations: kind !== 'DEMAND_GEN',
      keywords: kind === 'SEARCH',
    },
  };
}
