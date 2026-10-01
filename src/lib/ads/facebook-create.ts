// Tạo quảng cáo từ một bài viết có sẵn trên Page ("boost post").
//
// Đây là lớp NGUY HIỂM NHẤT trong toàn bộ hệ thống: ba lớp kia sửa thứ đã có,
// lớp này TẠO RA thứ tiêu tiền. Vì vậy mọi thứ tạo ra đều PAUSED, không có
// tham số nào bật được ACTIVE.
//
// Chuỗi bốn bước: campaign → adset → creative → ad. Bước nào hỏng thì các bước
// trước đã tạo rồi — hàm trả về những gì đã tạo để nơi gọi ghi nhật ký và dọn.

import { microsToMinor } from './currency';
import { buildTargeting, type TargetingSpec } from './targeting';
import { OBJECTIVE, promotedObject, missingRequirement, type AdObjective } from './objectives';

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
  /**
   * Nhắm đối tượng đầy đủ.
   *
   * Trước đây chỉ có quốc gia và khoảng tuổi. Đối chiếu với nhóm quảng cáo
   * thật trong tài khoản người dùng cho thấy thiếu giới tính, sở thích và vị
   * trí hiển thị — boost cho toàn bộ dân số 18–65 cả nước thì CPA chắc chắn xấu.
   */
  targeting: TargetingSpec;
  /**
   * Mục tiêu chiến dịch. Quyết định cả bốn trường objective /
   * optimization_goal / destination_type / promoted_object — xem objectives.ts.
   */
  objective: AdObjective;
  /** Chỉ dùng khi objective = 'sales'. */
  pixelId?: string | null;
  conversionEvent?: string | null;
  /**
   * Tiền tệ của tài khoản quảng cáo.
   *
   * Facebook nhận ngân sách theo ĐƠN VỊ NHỎ NHẤT: VND là đồng, USD là cents.
   * Chia cứng 1.000.000 sẽ đặt $0,15 thay cho $15 — cùng cái bẫy đã vá ở
   * facebook-write.ts, nên ở đây khai bắt buộc chứ không để mặc định.
   */
  currency: string;
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
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: {
      message?: string; error_user_msg?: string; error_user_title?: string;
      code?: number; error_subcode?: number;
    };
  };

  // BẪY: Facebook trả HTTP 200 kèm khối `error` cho một số lỗi tài khoản —
  // ví dụ code 31 / subcode 3858385 "tài khoản cần xác thực". Chỉ kiểm res.ok
  // là bỏ lọt hoàn toàn, và nút "Kiểm tra trước" sẽ báo hợp lệ trong khi
  // Facebook đang từ chối. Vì vậy PHẢI kiểm khối error trước tiên, bất kể mã
  // trạng thái HTTP.
  if (json.error) {
    const e = json.error;
    const title = e.error_user_title ? `${e.error_user_title}: ` : '';
    const code = e.code ? ` [mã ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''}]` : '';
    throw new AdCreateError(
      `${title}${e.error_user_msg || e.message || `HTTP ${res.status}`}${code}`, step, created,
    );
  }
  // Ở chế độ kiểm thử, Facebook trả 200 không có id — đó mới là thành công.
  if (!res.ok || (!validateOnly && !json.id)) {
    throw new AdCreateError(`Facebook trả HTTP ${res.status} không kèm id`, step, created);
  }
  return json as T;
}

function actOf(spec: BoostSpec): string {
  return spec.adAccountId.startsWith('act_') ? spec.adAccountId : `act_${spec.adAccountId}`;
}

function campaignBody(spec: BoostSpec): Record<string, string> {
  return {
    name: spec.campaignName,
    objective: OBJECTIVE[spec.objective].fbObjective,
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
 * Ba mục tiêu: Tương tác, Tin nhắn, Chuyển đổi. Bộ tham số của từng cái nằm ở
 * objectives.ts và phải khớp nhau theo bộ — đổi lẻ một trường là Facebook từ
 * chối, thường ở bước adset nhưng đôi khi tận bước tạo quảng cáo.
 */
export async function createBoostCampaign(token: string, spec: BoostSpec): Promise<CreatedAd> {
  const created: Partial<CreatedAd> = {};
  const act = actOf(spec);
  const obj = OBJECTIVE[spec.objective];

  // Chặn TRƯỚC khi gọi Facebook lần nào. Mẫu Chuyển đổi thiếu pixel sẽ hỏng ở
  // bước adset, tức là sau khi chiến dịch đã được tạo và phải đi dọn.
  const missing = missingRequirement(spec.objective, spec);
  if (missing) throw new AdCreateError(missing, 'campaign', created);

  // 1. Chiến dịch — LUÔN PAUSED.
  const campaign = await post<{ id: string }>(
    `/${act}/campaigns`, campaignBody(spec), token, 'campaign', created);
  created.campaignId = campaign.id;

  // 2. Nhóm quảng cáo. Ngân sách đặt ở đây (ABO) vì chiến dịch chỉ có một nhóm.
  const budget = microsToMinor(spec.dailyBudgetMicros, spec.currency);
  const promoted = promotedObject(spec.objective, spec);
  const adset = await post<{ id: string }>(`/${act}/adsets`, {
    name: `${spec.campaignName} — nhóm 1`,
    campaign_id: campaign.id,
    daily_budget: String(budget),
    billing_event: 'IMPRESSIONS',
    optimization_goal: obj.optimizationGoal,
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
    destination_type: obj.destinationType,
    // promoted_object chỉ gửi khi mục tiêu cần, và phải BỎ HẲN trường chứ không
    // gửi rỗng với Tương tác: POST_ENGAGEMENT kèm promoted_object bị từ chối
    // thẳng ("không thể dùng mục tiêu hiệu quả đã chọn cho mục tiêu chiến dịch").
    ...(promoted ? { promoted_object: JSON.stringify(promoted) } : {}),
    // buildTargeting lo phần khó: tỉnh/thành thay thế quốc gia chứ không cộng
    // thêm, giới tính rỗng thì BỎ trường thay vì gửi mảng rỗng, và vị trí tự
    // động thì không gửi trường vị trí nào. Xem ghi chú ở targeting.ts —
    // gửi sai kiểu nào trong ba kiểu đó đều hỏng im lặng.
    targeting: JSON.stringify(buildTargeting(spec.targeting)),
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

/**
 * Dọn sạch mọi thứ đã tạo khi chuỗi hỏng giữa chừng.
 *
 * Xoá chiến dịch kéo theo nhóm và quảng cáo bên trong, NHƯNG KHÔNG kéo theo
 * creative — creative là object cấp tài khoản, tồn tại độc lập. Chỉ xoá chiến
 * dịch là mỗi lần hỏng để lại một creative mồ côi tích tụ dần trong tài khoản.
 *
 * Nhận Partial vì lỗi có thể xảy ra ở bất kỳ bước nào.
 */
export async function cleanupPartial(
  token: string,
  created: Partial<CreatedAd>,
): Promise<void> {
  if (created.campaignId) await deleteCampaign(token, created.campaignId).catch(() => {});
  if (created.creativeId) {
    await fetch(`${GRAPH}/${VERSION}/${created.creativeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {});
  }
}
