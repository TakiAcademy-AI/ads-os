// Tạo chiến dịch Google Ads — dùng cho Đăng nhanh.
//
// KHÁC HẲN PHÍA FACEBOOK (facebook-create.ts): Facebook tạo tuần tự campaign →
// ad set → creative → ad, hỏng giữa chừng phải tự dọn. Google cho gửi TẤT CẢ
// trong một lệnh GoogleAdsService.mutate, dùng resource name tạm (ID âm) để
// các phần tham chiếu nhau. Lệnh đó là nguyên tử: một phép hỏng thì Google
// huỷ cả lệnh, không để lại rác. validateOnly kiểm y như thật mà không tạo gì.
//
// Chiến dịch LUÔN tạo ở trạng thái PAUSED — người dùng tự bật trong Google Ads
// sau khi xem lại. Cùng nguyên tắc với Đăng nhanh Facebook.
//
// Bốn loại làm được qua API mà không cần liên kết gì thêm: Tìm kiếm, Hiển thị,
// Performance Max, Demand Gen. Shopping cần Merchant Center, App cần app trên
// store, Video thuần gần như không tạo được qua API — cố ý không hỗ trợ.

import { GoogleAdsError, extractError, type GoogleAuth } from './google';
import type { GoogleCreateSpec } from './google-create-spec';

export * from './google-create-spec';

const HOST = 'https://googleads.googleapis.com';
const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const TIMEOUT_MS = 60_000;

/**
 * Dựng danh sách mutateOperations. Thứ tự QUAN TRỌNG: Google xử lý lần lượt,
 * phần nào tham chiếu ID tạm thì phần được tham chiếu phải đứng trước.
 */
export function buildOperations(customerId: string, s: GoogleCreateSpec): unknown[] {
  const cid = customerId.replace(/\D/g, '');
  let tmp = 0;
  const tempId = () => --tmp;
  const rn = (kind: string, id: number) => `customers/${cid}/${kind}/${id}`;
  const ops: unknown[] = [];
  const clean = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);

  // ── Ngân sách ──
  const budget = rn('campaignBudgets', tempId());
  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budget,
        name: `${s.name} · ngân sách #${Date.now()}`,
        amountMicros: String(s.dailyBudgetMicros),
        deliveryMethod: 'STANDARD',
        // PMax bắt buộc ngân sách riêng; loại khác để riêng cho dễ đổi về sau.
        explicitlyShared: false,
      },
    },
  });

  // ── Chiến dịch ──
  const campaign = rn('campaigns', tempId());
  const bidding = s.bidding === 'MAXIMIZE_CLICKS'
    ? { targetSpend: {} }
    : { maximizeConversions: s.targetCpaMicros ? { targetCpaMicros: String(s.targetCpaMicros) } : {} };
  ops.push({
    campaignOperation: {
      create: {
        resourceName: campaign,
        name: s.name,
        status: 'PAUSED',
        advertisingChannelType: s.kind,
        campaignBudget: budget,
        ...bidding,
        // Bắt buộc với chiến dịch mới từ 9/2025; thiếu là Google từ chối cả lệnh.
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        ...(s.kind === 'SEARCH' ? {
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            // Không để Search lan sang mạng hiển thị — tiền chảy sang banner
            // mà người tạo chiến dịch Tìm kiếm không hề định trả.
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
        } : {}),
        // Business name và logo nằm ở asset group (không dùng brand guidelines)
        // để cả bộ tài sản PMax nằm một chỗ, giống Display và Demand Gen.
        ...(s.kind === 'PERFORMANCE_MAX' ? { brandGuidelinesEnabled: false } : {}),
      },
    },
  });

  // ── Vị trí và ngôn ngữ ──
  // Demand Gen KHÔNG nhận ở cấp chiến dịch (Google trả lỗi trigger
  // OWNED_AND_OPERATED) — với loại này đặt ở cấp nhóm quảng cáo, xem bên dưới.
  if (s.kind !== 'DEMAND_GEN') for (const g of s.geoTargets) {
    ops.push({
      campaignCriterionOperation: {
        create: { campaign, location: { geoTargetConstant: `geoTargetConstants/${g}` } },
      },
    });
  }
  if (s.kind !== 'DEMAND_GEN') for (const l of s.languages) {
    ops.push({
      campaignCriterionOperation: {
        create: { campaign, language: { languageConstant: `languageConstants/${l}` } },
      },
    });
  }

  // ── Ảnh: tạo asset trước, phần sau tham chiếu bằng ID tạm ──
  const imageAssets = (kind: 'landscape' | 'square' | 'logo') =>
    (s.images?.[kind] ?? []).map((data, i) => {
      const resourceName = rn('assets', tempId());
      ops.push({
        assetOperation: {
          create: {
            resourceName,
            name: `${s.name} · ${kind} ${i + 1} · ${Date.now()}`,
            type: 'IMAGE',
            imageAsset: { data },
          },
        },
      });
      return resourceName;
    });

  const headlines = clean(s.headlines);
  const descriptions = clean(s.descriptions);
  const longHeadlines = clean(s.longHeadlines);
  const businessName = (s.businessName ?? '').trim();

  if (s.kind === 'PERFORMANCE_MAX') {
    const landscape = imageAssets('landscape');
    const square = imageAssets('square');
    const logo = imageAssets('logo');
    const text = (t: string) => {
      const resourceName = rn('assets', tempId());
      ops.push({ assetOperation: { create: { resourceName, textAsset: { text: t } } } });
      return resourceName;
    };
    const links: [string, string][] = [
      ...headlines.map((h) => [text(h), 'HEADLINE'] as [string, string]),
      ...longHeadlines.map((h) => [text(h), 'LONG_HEADLINE'] as [string, string]),
      ...descriptions.map((d) => [text(d), 'DESCRIPTION'] as [string, string]),
      [text(businessName), 'BUSINESS_NAME'],
      ...landscape.map((a) => [a, 'MARKETING_IMAGE'] as [string, string]),
      ...square.map((a) => [a, 'SQUARE_MARKETING_IMAGE'] as [string, string]),
      ...logo.map((a) => [a, 'LOGO'] as [string, string]),
    ];
    const assetGroup = rn('assetGroups', tempId());
    ops.push({
      assetGroupOperation: {
        create: {
          resourceName: assetGroup,
          name: `${s.name} · nhóm tài sản`,
          campaign,
          finalUrls: [s.finalUrl],
          status: 'ENABLED',
        },
      },
    });
    // Google đòi đủ bộ tài sản tối thiểu NGAY trong lệnh tạo asset group.
    for (const [asset, fieldType] of links) {
      ops.push({ assetGroupAssetOperation: { create: { assetGroup, asset, fieldType } } });
    }
    return ops;
  }

  // ── Nhóm quảng cáo (Search, Display, Demand Gen) ──
  const adGroup = rn('adGroups', tempId());
  ops.push({
    adGroupOperation: {
      create: {
        resourceName: adGroup,
        name: `${s.name} · nhóm 1`,
        campaign,
        status: 'ENABLED',
        // Demand Gen không có loại nhóm quảng cáo — đặt vào là bị từ chối.
        ...(s.kind === 'SEARCH' ? { type: 'SEARCH_STANDARD' } : {}),
        ...(s.kind === 'DISPLAY' ? { type: 'DISPLAY_STANDARD' } : {}),
      },
    },
  });

  if (s.kind === 'DEMAND_GEN') {
    for (const g of s.geoTargets) {
      ops.push({
        adGroupCriterionOperation: {
          create: { adGroup, location: { geoTargetConstant: `geoTargetConstants/${g}` } },
        },
      });
    }
    for (const l of s.languages) {
      ops.push({
        adGroupCriterionOperation: {
          create: { adGroup, language: { languageConstant: `languageConstants/${l}` } },
        },
      });
    }
  }

  if (s.kind === 'SEARCH') {
    for (const k of s.keywords ?? []) {
      if (!k.text.trim()) continue;
      ops.push({
        adGroupCriterionOperation: {
          create: { adGroup, status: 'ENABLED', keyword: { text: k.text.trim(), matchType: k.matchType } },
        },
      });
    }
    ops.push({
      adGroupAdOperation: {
        create: {
          adGroup,
          status: 'ENABLED',
          ad: {
            finalUrls: [s.finalUrl],
            responsiveSearchAd: {
              headlines: headlines.map((text) => ({ text })),
              descriptions: descriptions.map((text) => ({ text })),
              ...(s.path1 ? { path1: s.path1 } : {}),
              ...(s.path1 && s.path2 ? { path2: s.path2 } : {}),
            },
          },
        },
      },
    });
    return ops;
  }

  const landscape = imageAssets('landscape').map((asset) => ({ asset }));
  const square = imageAssets('square').map((asset) => ({ asset }));
  // Display: KHÔNG gửi logo. Đã thử trên tài khoản thật — logo 1:1 bị trả
  // ASPECT_RATIO_NOT_ALLOWED trong responsive display ad, trong khi cùng ảnh
  // đó qua được ở PMax và Demand Gen. Logo là tuỳ chọn với Display.
  const logo = s.kind === 'DISPLAY' ? [] : imageAssets('logo').map((asset) => ({ asset }));

  const ad = s.kind === 'DISPLAY'
    ? {
      responsiveDisplayAd: {
        marketingImages: landscape,
        squareMarketingImages: square,
        ...(logo.length ? { logoImages: logo } : {}),
        headlines: headlines.map((text) => ({ text })),
        longHeadline: { text: longHeadlines[0] ?? headlines[0] },
        descriptions: descriptions.map((text) => ({ text })),
        businessName,
      },
    }
    : {
      demandGenMultiAssetAd: {
        marketingImages: landscape,
        squareMarketingImages: square,
        logoImages: logo,
        headlines: headlines.map((text) => ({ text })),
        descriptions: descriptions.map((text) => ({ text })),
        businessName,
      },
    };

  ops.push({
    adGroupAdOperation: {
      create: {
        adGroup,
        status: 'ENABLED',
        ad: { name: s.name, finalUrls: [s.finalUrl], ...ad },
      },
    },
  });
  return ops;
}

export interface CreatedCampaign {
  campaignId: string;
  resourceName: string;
}

/**
 * Gửi toàn bộ chiến dịch trong một lệnh nguyên tử. KHÔNG thử lại — cùng lý do
 * với google-write.ts: request có thể đã tới nơi, thử lại là tạo hai chiến dịch.
 */
export async function createGoogleCampaign(
  auth: GoogleAuth,
  customerId: string,
  spec: GoogleCreateSpec,
  validateOnly = false,
): Promise<CreatedCampaign | null> {
  const cid = customerId.replace(/\D/g, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
  };
  if (auth.developerToken) headers['developer-token'] = auth.developerToken;
  if (auth.loginCustomerId) headers['login-customer-id'] = auth.loginCustomerId.replace(/\D/g, '');

  const res = await fetch(`${HOST}/${VERSION}/customers/${cid}/googleAds:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mutateOperations: buildOperations(cid, spec),
      validateOnly,
      // Mặc định đã là false — ghi rõ ra: một phép hỏng thì huỷ CẢ lệnh.
      partialFailure: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleAdsError(
      extractError(body, res.status), res.status, res.status === 401 || res.status === 403,
    );
  }
  if (validateOnly) return null;

  const results = (body as { mutateOperationResponses?: Record<string, { resourceName?: string }>[] })
    .mutateOperationResponses ?? [];
  const campaignRn = results.map((r) => r.campaignResult?.resourceName).find(Boolean) ?? '';
  return { campaignId: campaignRn.split('/').pop() ?? '', resourceName: campaignRn };
}
