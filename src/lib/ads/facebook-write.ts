// Lệnh GHI lên tài khoản quảng cáo Facebook.
//
// Tách riêng khỏi facebook.ts một cách có chủ đích: file kia đọc, file này tiêu
// tiền của người khác. Ai sửa file này phải biết mình đang đụng vào cái gì.
//
// Ở đây KHÔNG có logic quyết định. Quyết định nằm ở lib/automation/auto-pause.ts
// với đầy đủ guard. File này chỉ thực thi một lệnh đã được duyệt.

import { microsToMinor, minorToMicros } from './currency';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';
const TIMEOUT_MS = 20_000;

export class FacebookWriteError extends Error {
  constructor(message: string, readonly code?: number, readonly isPermission = false) {
    super(message);
    this.name = 'FacebookWriteError';
  }
}

interface GraphErr { message?: string; code?: number; error_subcode?: number }

/**
 * Hướng dẫn cho những lỗi chỉ người dùng tự tay gỡ được, code không sửa được.
 *
 * 31/3858385 là chốt bảo mật của Meta, KHÔNG phải lỗi payload hay thiếu quyền:
 * Meta nghi truy cập lạ (IP mới — chính là VPS chạy app, tạo dồn dập qua API…)
 * nên khoá quyền tạo/sửa quảng cáo. Thông điệp gốc "Please authenticate your
 * account" không nói phải làm gì.
 *
 * CÁCH GỠ CHẮC ĂN NHẤT: dùng token System User. Đã kiểm thật ngày 2026-10-01:
 * cùng một tài khoản, cùng một bài Reel, token người thật thì hỏng ở bước tạo
 * quảng cáo với 31/3858385, token System User thì chạy hết cả bốn bước. Khoá
 * này bám vào NGƯỜI DÙNG Facebook; System User không phải người nên không có
 * chốt xác thực nào áp lên nó.
 *
 * Ghi chú cũ ở đây từng viết "đổi token không gỡ được" — SAI, đã bị phép thử
 * trên bác bỏ. Đúng là đổi sang token của một người khác thì không gỡ được,
 * vì ai cũng là người; phải đổi sang System User.
 */
export function fbActionHint(code?: number, subcode?: number): string | null {
  if (code === 31 && subcode === 3858385) {
    return 'Meta đang tạm khoá quyền tạo/sửa quảng cáo của tài khoản này để kiểm tra bảo mật. '
      + 'Khoá này bám vào TÀI KHOẢN FACEBOOK CỦA NGƯỜI dùng để kết nối, không phải vào tài '
      + 'khoản quảng cáo — nên đổi sang tài khoản quảng cáo khác hay nhờ người khác kết nối '
      + 'đều không gỡ được.\n\n'
      + 'CÁCH CHẮC ĂN NHẤT — dùng token System User (đã kiểm thật, chạy được ngay): vào '
      + 'business.facebook.com/settings → Business sở hữu tài khoản quảng cáo → Người dùng → '
      + 'Người dùng hệ thống → tạo một cái vai trò Quản trị viên → Thêm tài sản: gán tài khoản '
      + 'quảng cáo (Quản lý chiến dịch) VÀ Trang (Quản lý Trang) → Tạo mã truy cập mới, chọn '
      + 'app này, tick ads_management, ads_read, business_management, pages_show_list, '
      + 'pages_read_engagement, pages_manage_ads. Dán token đó vào Kết nối → Dán token. '
      + 'System User không phải con người nên không dính chốt xác thực này, và token của nó '
      + 'không hết hạn.\n\n'
      + 'CÁCH CÒN LẠI — tự xác thực: đăng nhập Facebook bằng đúng người đã kết nối, vào Ads '
      + 'Manager → chọn tài khoản quảng cáo → mở chỉnh sửa một nhóm quảng cáo bất kỳ → bấm '
      + '"Start authentication" ở khung "Verifying your changes" bên phải. Không thấy nút thì '
      + 'xem Business Settings → Security Center; khoá thường tự gỡ sau vài ngày. '
      + 'Đừng bấm thử lại liên tục.';
  }
  return null;
}

/**
 * Gọi lệnh ghi. KHÔNG thử lại.
 *
 * Retry một lệnh ghi là nguy hiểm: request có thể đã tới Facebook và thành công
 * nhưng response mất trên đường về. Thử lại khi đó là tắt hai lần, hoặc tệ hơn
 * là ghi đè một thay đổi người dùng vừa làm tay. Thà báo lỗi để người xử lý.
 */
async function write(path: string, body: Record<string, string>, token: string): Promise<unknown> {
  const res = await fetch(`${GRAPH}/${VERSION}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: GraphErr };
  // Cùng bẫy với facebook-create.ts: Facebook trả HTTP 200 kèm khối error cho
  // một số lỗi tài khoản. Chỉ kiểm res.ok là coi thất bại thành công.
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    // 200/10 = thiếu quyền; 190 = token hỏng; 100 = tham số sai.
    const isPermission = e.code === 200 || e.code === 10 || e.code === 190;
    throw new FacebookWriteError(
      fbActionHint(e.code, e.error_subcode) ?? e.message ?? `Facebook trả HTTP ${res.status}`,
      e.code,
      isPermission,
    );
  }
  return json;
}

export type CampaignStatus = 'ACTIVE' | 'PAUSED';

/**
 * Đổi trạng thái chiến dịch.
 *
 * Cố ý KHÔNG hỗ trợ 'DELETED' hay 'ARCHIVED' — xoá là không hoàn tác được, và
 * không có tình huống nào tự động hoá cần xoá chiến dịch.
 */
export async function setCampaignStatus(
  token: string,
  campaignExternalId: string,
  status: CampaignStatus,
): Promise<void> {
  await write(`/${campaignExternalId}`, { status }, token);
}

/**
 * Đổi ngân sách/ngày của chiến dịch (CBO).
 *
 * Facebook nhận đơn vị nhỏ nhất của tiền tệ, KHÔNG phải micros — VND là đồng,
 * USD là cents. Vì vậy PHẢI truyền currency: chia cứng 1.000.000 sẽ đặt $0,15
 * thay cho $15 trên tài khoản USD, và nhật ký vẫn báo thành công.
 */
export async function setCampaignDailyBudget(
  token: string,
  campaignExternalId: string,
  budgetMicros: number,
  currency: string,
): Promise<void> {
  const value = microsToMinor(budgetMicros, currency);
  if (value <= 0) {
    throw new FacebookWriteError('Ngân sách phải lớn hơn 0');
  }
  await write(`/${campaignExternalId}`, { daily_budget: String(value) }, token);
}

/** Đọc lại ngân sách, trả về micros. null nếu không đọc được. */
export async function readCampaignBudget(
  token: string,
  campaignExternalId: string,
  currency: string,
): Promise<number | null> {
  const res = await fetch(
    `${GRAPH}/${VERSION}/${campaignExternalId}?fields=daily_budget`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { daily_budget?: string };
  if (!json.daily_budget) return null;
  return minorToMicros(json.daily_budget, currency);
}

/** Đọc lại trạng thái để xác nhận lệnh đã ăn — không tin response, tin dữ liệu. */
export async function readCampaignStatus(
  token: string,
  campaignExternalId: string,
): Promise<string | null> {
  const res = await fetch(
    `${GRAPH}/${VERSION}/${campaignExternalId}?fields=status`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { status?: string };
  return json.status ?? null;
}

// ─── Chỉnh sửa từ trang chi tiết chiến dịch ──────────────────────────────────
//
// Facebook dùng chung một kiểu ghi cho chiến dịch, nhóm quảng cáo và quảng cáo:
// POST /<id> với trường cần đổi. Vẫn không thử lại, vẫn không có xoá/lưu trữ.

/** Đổi tên chiến dịch, nhóm quảng cáo hoặc quảng cáo. */
export async function renameObject(token: string, objectId: string, name: string): Promise<void> {
  await write(`/${objectId}`, { name }, token);
}

/** Bật/tạm dừng nhóm quảng cáo hoặc quảng cáo. */
export async function setObjectStatus(
  token: string, objectId: string, status: CampaignStatus,
): Promise<void> {
  await write(`/${objectId}`, { status }, token);
}

/**
 * Đổi ngân sách/ngày của NHÓM quảng cáo — dùng khi chiến dịch không đặt ngân
 * sách ở cấp chiến dịch (ABO). Cùng quy tắc đơn vị với setCampaignDailyBudget.
 */
export async function setAdSetDailyBudget(
  token: string, adSetId: string, budgetMicros: number, currency: string,
): Promise<void> {
  const value = microsToMinor(budgetMicros, currency);
  if (value <= 0) throw new FacebookWriteError('Ngân sách phải lớn hơn 0');
  await write(`/${adSetId}`, { daily_budget: String(value) }, token);
}
