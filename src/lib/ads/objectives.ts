// Ba mục tiêu chiến dịch Ads OS tạo được, và bộ tham số Facebook đòi cho từng cái.
//
// Gom về một chỗ vì bốn trường dưới đây phải khớp nhau theo bộ: đổi mục tiêu mà
// quên đổi optimization_goal hay promoted_object là Facebook từ chối ở bước
// adset — hoặc tệ hơn, ở bước tạo quảng cáo sau khi đã tạo nửa chuỗi.
//
// Mọi tổ hợp ở đây đều đã dò bằng execution_options=["validate_only"] trên tài
// khoản thật, không phải chép từ tài liệu.

export type AdObjective = 'engagement' | 'messages' | 'sales';

export const AD_OBJECTIVES: AdObjective[] = ['engagement', 'messages', 'sales'];

export interface ObjectiveSpec {
  label: string;
  hint: string;
  /** objective ở cấp chiến dịch. */
  fbObjective: string;
  /** optimization_goal ở cấp nhóm quảng cáo. */
  optimizationGoal: string;
  /** destination_type ở cấp nhóm quảng cáo. */
  destinationType: string;
  /**
   * promoted_object cần gì.
   *
   *   null  — TUYỆT ĐỐI không gửi. Với POST_ENGAGEMENT, Facebook từ chối thẳng:
   *           "không thể dùng mục tiêu hiệu quả đã chọn cho mục tiêu chiến dịch".
   *   page  — { page_id }
   *   pixel — { pixel_id, custom_event_type }
   */
  promoted: null | 'page' | 'pixel';
}

export const OBJECTIVE: Record<AdObjective, ObjectiveSpec> = {
  engagement: {
    label: 'Tương tác',
    hint: 'Đẩy bài viết cho nhiều người thấy và tương tác. Không đo được đơn hàng.',
    fbObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'POST_ENGAGEMENT',
    destinationType: 'ON_POST',
    promoted: null,
  },
  messages: {
    label: 'Tin nhắn',
    hint: 'Người xem bấm vào là mở Messenger nhắn cho Page. Phổ biến nhất ở Việt Nam.',
    fbObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'CONVERSATIONS',
    destinationType: 'MESSENGER',
    promoted: 'page',
  },
  sales: {
    label: 'Chuyển đổi',
    hint: 'Tối ưu theo sự kiện pixel trên website. Cần pixel đã gắn và đang nhận dữ liệu.',
    fbObjective: 'OUTCOME_SALES',
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    destinationType: 'WEBSITE',
    promoted: 'pixel',
  },
};

/**
 * Sự kiện chuyển đổi dùng được với OUTCOME_SALES.
 *
 * Danh sách này là kết quả dò thật, không phải mọi giá trị Facebook công bố:
 * INITIATE_CHECKOUT và LEAD đều bị từ chối ở bước adset ("sự kiện chuyển đổi
 * này không phù hợp với mục tiêu bạn đã chọn") — LEAD thuộc về OUTCOME_LEADS,
 * là mục tiêu Ads OS chưa làm.
 */
export const CONVERSION_EVENTS: { value: string; label: string }[] = [
  { value: 'PURCHASE', label: 'Mua hàng' },
  { value: 'ADD_TO_CART', label: 'Thêm vào giỏ' },
  { value: 'COMPLETE_REGISTRATION', label: 'Đăng ký xong' },
  { value: 'CONTENT_VIEW', label: 'Xem nội dung' },
  { value: 'ADD_TO_WISHLIST', label: 'Thêm vào yêu thích' },
  { value: 'SUBSCRIBE', label: 'Đăng ký gói' },
];

export function isConversionEvent(v: string): boolean {
  return CONVERSION_EVENTS.some((e) => e.value === v);
}

/**
 * promoted_object cho nhóm quảng cáo, hoặc null nếu mục tiêu này không được gửi.
 *
 * Trả null KHÁC trả object rỗng: nơi gọi phải bỏ hẳn trường khỏi payload.
 */
export function promotedObject(
  objective: AdObjective,
  src: { pageId: string; pixelId?: string | null; conversionEvent?: string | null },
): Record<string, string> | null {
  const spec = OBJECTIVE[objective];
  if (spec.promoted === 'page') return { page_id: src.pageId };
  if (spec.promoted === 'pixel') {
    if (!src.pixelId || !src.conversionEvent) return null;
    return { pixel_id: src.pixelId, custom_event_type: src.conversionEvent };
  }
  return null;
}

/** Thiếu gì thì không tạo được quảng cáo với mục tiêu này — null là đủ. */
export function missingRequirement(
  objective: AdObjective,
  src: { pixelId?: string | null; conversionEvent?: string | null },
): string | null {
  if (objective !== 'sales') return null;
  if (!src.pixelId) return 'Mục tiêu Chuyển đổi cần chọn pixel';
  if (!src.conversionEvent) return 'Mục tiêu Chuyển đổi cần chọn sự kiện chuyển đổi';
  if (!isConversionEvent(src.conversionEvent)) {
    return `Sự kiện "${src.conversionEvent}" không dùng được với mục tiêu Chuyển đổi`;
  }
  return null;
}
