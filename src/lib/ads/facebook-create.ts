// Tạo quảng cáo từ một bài viết có sẵn trên Page ("boost post").
//
// Đây là lớp NGUY HIỂM NHẤT trong toàn bộ hệ thống: ba lớp kia sửa thứ đã có,
// lớp này TẠO RA thứ tiêu tiền. Vì vậy mọi thứ tạo ra đều PAUSED, không có
// tham số nào bật được ACTIVE.
//
// Chuỗi bốn bước: campaign → adset → creative → ad. Bước nào hỏng thì các bước
// trước đã tạo rồi — hàm trả về những gì đã tạo để nơi gọi ghi nhật ký và dọn.

import { microsToMinor } from './currency';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';
const TIMEOUT_MS = 25_000;

export class AdCreateError extends Error {
  constructor(
    message: string,
    /** Bước hỏng — để biết cần dọn những gì. */
    readonly step: 'campaign' | 'adset' | 'creative' | 'ad',
    readonly created: Partial<CreatedAd> = {},
  ) {
    super(message);
    this.name = 'AdCreateError';
  }
}

export interface CreatedAd {
  campaignId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
}

export interface BoostSpec {
  adAccountId: string;      // 'act_<số>'
  pageId: string;
  /** Dạng '<page_id>_<post_id>' đúng như Graph API trả về. */
  postId: string;
  campaignName: string;
  dailyBudgetMicros: number;
  /** Mã quốc gia ISO, vd ['VN']. */
  countries: string[];
  /**
   * Tiền tệ của tài khoản quảng cáo.
   *
   * Facebook nhận ngân sách theo ĐƠN VỊ NHỎ NHẤT: VND là đồng, USD là cents.
   * Chia cứng 1.000.000 sẽ đặt $0,15 thay cho $15 — cùng cái bẫy đã vá ở
   * facebook-write.ts, nên ở đây khai bắt buộc chứ không để mặc định.
   */
  currency: string;
  ageMin: number;
  ageMax: number;
}

async function post<T>(
  path: string,
  body: Record<string, string>,
  token: string,
  step: AdCreateError['step'],
  created: Partial<CreatedAd>,
  validateOnly = false,
): Promise<T> {
  const payload = { ...body };
  // execution_options=validate_only: Facebook kiểm payload và trả lỗi y như
  // thật NHƯNG KHÔNG TẠO GÌ CẢ. Đây là cách duy nhất thử tham số mà không đụng
  // vào tài khoản thật — và nó cũng không kích hoạt hệ thống chống lạm dụng.
  if (validateOnly) payload.execution_options = '["validate_only"]';

  const res = await fetch(`${GRAPH}/${VERSION}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; error_user_msg?: string } };
  // Ở chế độ kiểm thử, Facebook trả 200 mà không có id — đó là thành công.
  if (!res.ok || (!validateOnly && !json.id)) {
    const e = json.error ?? {};
    throw new AdCreateError(e.error_user_msg || e.message || `HTTP ${res.status}`, step, created);
  }
  return json as T;
}

function actOf(spec: BoostSpec): string {
  return spec.adAccountId.startsWith('act_') ? spec.adAccountId : `act_${spec.adAccountId}`;
}

function campaignBody(spec: BoostSpec): Record<string, string> {
  return {
    name: spec.campaignName,
    objective: 'OUTCOME_ENGAGEMENT',
    status: 'PAUSED',
    // Bắt buộc từ 2021. Rỗng = không thuộc nhóm nhà ở/việc làm/tín dụng.
    special_ad_categories: '[]',
    // Bắt buộc khi ngân sách đặt ở cấp nhóm (ABO) chứ không phải cấp chiến dịch.
    // false = không cho các nhóm mượn ngân sách của nhau. Chiến dịch này chỉ có
    // một nhóm nên chia sẻ hay không đều như nhau, nhưng để true thì Facebook
    // được phép lệch khỏi con số người dùng đặt — không nên với tiền người khác.
    is_adset_budget_sharing_enabled: 'false',
  };
}

/**
 * Kiểm payload trước khi tạo, KHÔNG tạo object nào.
 *
 * Chỉ kiểm được bước chiến dịch: kiểm nhóm quảng cáo cần campaign_id thật, kiểm
 * quảng cáo cần adset_id thật. Nhưng bấy nhiêu đã bắt được những thứ hay hỏng
 * nhất vì chúng thuộc về TÀI KHOẢN chứ không phải payload: chưa gắn thẻ, bị
 * khoá quyền tạo quảng cáo, token hỏng.
 *
 * Nơi gọi phải nói rõ với người dùng rằng đây là kiểm một phần, không phải
 * bảo chứng cả chuỗi sẽ chạy.
 */
export async function validateBoostCampaign(token: string, spec: BoostSpec): Promise<void> {
  await post(`/${actOf(spec)}/campaigns`, campaignBody(spec), token, 'campaign', {}, true);
}

/**
 * Tạo chiến dịch quảng cáo đẩy một bài viết có sẵn.
 *
 * Mục tiêu cố định là OUTCOME_ENGAGEMENT tối ưu POST_ENGAGEMENT — đây là loại
 * duy nhất chạy được từ một bài viết mà không cần pixel, tập đối tượng tuỳ
 * chỉnh hay trang đích.
 */
export async function createBoostCampaign(token: string, spec: BoostSpec): Promise<CreatedAd> {
  const created: Partial<CreatedAd> = {};
  const act = actOf(spec);

  // 1. Chiến dịch — LUÔN PAUSED.
  const campaign = await post<{ id: string }>(
    `/${act}/campaigns`, campaignBody(spec), token, 'campaign', created);
  created.campaignId = campaign.id;

  // 2. Nhóm quảng cáo. Ngân sách đặt ở đây (ABO) vì chiến dịch chỉ có một nhóm.
  const budget = microsToMinor(spec.dailyBudgetMicros, spec.currency);
  const adset = await post<{ id: string }>(`/${act}/adsets`, {
    name: `${spec.campaignName} — nhóm 1`,
    campaign_id: campaign.id,
    daily_budget: String(budget),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    // Đấu thầu tự động. Phải đặt ở ĐÂY chứ không phải ở chiến dịch: Facebook
    // chỉ nhận bid_strategy ở cấp nào giữ ngân sách, mà ngân sách của ta ở cấp
    // nhóm. Các chiến lược khác đòi khai giá thầu trần — con số người dùng
    // không nhập ở đây, và đoán sai thì quảng cáo không phân phối được.
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    // Trường BẮT BUỘC, và là trường khó tìm nhất trong cả chuỗi.
    //
    // OUTCOME_ENGAGEMENT không nói lên tương tác Ở ĐÂU. Thiếu destination_type,
    // Facebook mặc định hiểu là chuyển đổi trên website và từ chối ở bước TẠO
    // QUẢNG CÁO — ba bước trước vẫn qua ngon lành — với thông báo đòi pixel,
    // không hề nhắc tới trường còn thiếu.
    //
    // ON_PAGE và ON_AD đều bị từ chối với POST_ENGAGEMENT.
    destination_type: 'ON_POST',
    // CỐ Ý không đặt promoted_object. Nghe thì hợp lý — khai rõ quảng cáo cho
    // Page nào — nhưng với POST_ENGAGEMENT thì Facebook từ chối thẳng:
    // "không thể dùng mục tiêu hiệu quả đã chọn cho mục tiêu chiến dịch".
    // promoted_object{page_id} chỉ dành cho PAGE_LIKES.
    targeting: JSON.stringify({
      geo_locations: { countries: spec.countries },
      age_min: spec.ageMin,
      age_max: spec.ageMax,
    }),
    status: 'PAUSED',
  }, token, 'adset', created);
  created.adsetId = adset.id;

  // 3. Creative trỏ THẲNG vào bài viết có sẵn — không dựng nội dung mới.
  const creative = await post<{ id: string }>(`/${act}/adcreatives`, {
    name: `${spec.campaignName} — creative`,
    object_story_id: spec.postId,
  }, token, 'creative', created);
  created.creativeId = creative.id;

  // 4. Quảng cáo.
  const ad = await post<{ id: string }>(`/${act}/ads`, {
    name: `${spec.campaignName} — ad`,
    adset_id: adset.id,
    creative: JSON.stringify({ creative_id: creative.id }),
    status: 'PAUSED',
  }, token, 'ad', created);

  return {
    campaignId: campaign.id, adsetId: adset.id,
    creativeId: creative.id, adId: ad.id,
  };
}

/**
 * Dọn chiến dịch tạo dở khi chuỗi hỏng giữa chừng.
 *
 * Xoá chiến dịch là kéo theo adset và ad bên trong. Đây là chỗ DUY NHẤT trong
 * hệ thống được phép xoá, và chỉ xoá thứ mình vừa tạo vài giây trước.
 */
export async function deleteCampaign(token: string, campaignId: string): Promise<void> {
  await fetch(`${GRAPH}/${VERSION}/${campaignId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}
