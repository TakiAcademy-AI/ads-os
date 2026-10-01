// Dựng khối targeting gửi lên Facebook, và tra cứu sở thích / địa điểm.
//
// Tách riêng vì đây là phần dễ sai nhất và hậu quả im lặng: gửi thiếu thì
// Facebook tự chọn mặc định rộng hơn hẳn ý người dùng, gửi thừa một mảng rỗng
// thì quảng cáo không hiển thị ở đâu cả. Cả hai đều không báo lỗi.

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';
const TIMEOUT_MS = 20_000;

export interface Interest { id: string; name: string }
export interface GeoLocation { type: 'city' | 'region'; key: string; name: string }

export interface Placements {
  automatic: boolean;
  publisherPlatforms?: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
}

export interface TargetingSpec {
  countries: string[];
  locations: GeoLocation[];
  ageMin: number;
  ageMax: number;
  /** Quy ước Facebook: 1=nam, 2=nữ. Rỗng = mọi giới. */
  genders: number[];
  interests: Interest[];
  placements: Placements;
  advantageAudience: boolean;
}

/**
 * Dựng object targeting cho Graph API.
 *
 * Nguyên tắc xuyên suốt: trường nào người dùng không khai thì KHÔNG gửi, chứ
 * không gửi giá trị rỗng. Facebook hiểu "không có trường" là "không giới hạn",
 * còn "mảng rỗng" là "không khớp gì cả".
 */
export function buildTargeting(t: TargetingSpec): Record<string, unknown> {
  const geo: Record<string, unknown> = {};

  // Tỉnh/thành THAY THẾ quốc gia, không cộng thêm. Gửi cả hai là nhắm cả nước
  // — đúng cái người dùng vừa cố thu hẹp.
  const cities = t.locations.filter((l) => l.type === 'city');
  const regions = t.locations.filter((l) => l.type === 'region');
  if (cities.length || regions.length) {
    if (cities.length) geo.cities = cities.map((c) => ({ key: c.key }));
    if (regions.length) geo.regions = regions.map((r) => ({ key: r.key }));
  } else {
    geo.countries = t.countries;
  }

  const out: Record<string, unknown> = {
    geo_locations: geo,
    age_min: t.ageMin,
    age_max: t.ageMax,
    targeting_automation: { advantage_audience: t.advantageAudience ? 1 : 0 },
  };

  // Mảng rỗng = mọi giới. Gửi [] lên Facebook thì không ai thấy quảng cáo.
  if (t.genders.length === 1) out.genders = t.genders;

  if (t.interests.length) {
    out.flexible_spec = [{ interests: t.interests.map((i) => ({ id: i.id, name: i.name })) }];
  }

  // automatic = bỏ hẳn mọi trường vị trí. Đây là mặc định của Facebook và
  // thường cho kết quả tốt hơn tự chọn tay.
  if (!t.placements.automatic) {
    const p = t.placements;
    const platforms = p.publisherPlatforms ?? [];
    if (platforms.length) out.publisher_platforms = platforms;
    if (p.facebookPositions?.length) out.facebook_positions = p.facebookPositions;
    if (p.instagramPositions?.length) out.instagram_positions = p.instagramPositions;

    // Messenger và Audience Network không có mặc định như Facebook/Instagram:
    // nêu tên nền tảng mà bỏ trống vị trí thì Facebook từ chối cả nhóm quảng
    // cáo. Giao diện không hỏi hai cái này — điền giá trị phổ thông ở đây.
    if (platforms.includes('messenger')) out.messenger_positions = ['messenger_home'];
    if (platforms.includes('audience_network')) out.audience_network_positions = ['classic'];
  }

  return out;
}

/**
 * Ước tính số người tiếp cận được với khối targeting này.
 *
 * Đây cũng là cách kiểm tra targeting rẻ nhất: endpoint chỉ đọc, không tạo ra
 * gì, nhưng Facebook vẫn soi toàn bộ khối và báo lỗi y như lúc tạo nhóm quảng
 * cáo. Sai một trường là biết ngay, thay vì biết sau khi đã tạo nửa chuỗi.
 */
export async function estimateReach(
  token: string, actId: string, t: TargetingSpec,
): Promise<{ lower: number; upper: number }> {
  const u = new URL(`${GRAPH}/${VERSION}/${actId}/delivery_estimate`);
  u.searchParams.set('optimization_goal', 'POST_ENGAGEMENT');
  u.searchParams.set('targeting_spec', JSON.stringify(buildTargeting(t)));
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number }[];
    error?: { message?: string };
  };
  // Facebook trả HTTP 200 kèm error body cho một số lỗi tài khoản — phải xét
  // error trước status, không phải ngược lại.
  if (json.error) throw new Error(json.error.message ?? 'Facebook từ chối khối nhắm đối tượng');
  if (!res.ok) throw new Error(`Facebook trả HTTP ${res.status}`);
  const d = json.data?.[0];
  return { lower: d?.estimate_mau_lower_bound ?? 0, upper: d?.estimate_mau_upper_bound ?? 0 };
}

// ─── Tra cứu ─────────────────────────────────────────────────────────────────

interface SearchRow {
  id?: string; key?: string; name: string; type?: string;
  audience_size_lower_bound?: number; audience_size_upper_bound?: number;
  country_code?: string; region?: string;
}

async function search(token: string, params: Record<string, string>): Promise<SearchRow[]> {
  const u = new URL(`${GRAPH}/${VERSION}/search`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: SearchRow[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Facebook trả HTTP ${res.status}`);
  return json.data ?? [];
}

/** Tìm sở thích. Trả kèm cỡ đối tượng để người dùng biết nó rộng hay hẹp. */
export async function searchInterests(
  token: string, q: string,
): Promise<(Interest & { audience: number })[]> {
  const rows = await search(token, {
    type: 'adinterest', q, limit: '25',
    locale: 'vi_VN',
  });
  return rows
    .filter((r) => r.id)
    .map((r) => ({
      id: r.id!,
      name: r.name,
      // Lấy cận dưới: nói ít hơn thực tế an toàn hơn nói nhiều hơn.
      audience: r.audience_size_lower_bound ?? 0,
    }));
}

/**
 * Tìm tỉnh/thành. Chỉ trong một quốc gia để tránh trả về trùng tên —
 * "Hà Nội" chỉ có một, nhưng "Springfield" thì hàng chục.
 */
export async function searchLocations(
  token: string, q: string, country = 'VN',
): Promise<GeoLocation[]> {
  const rows = await search(token, {
    type: 'adgeolocation',
    location_types: '["city","region"]',
    q, limit: '25', country_code: country, locale: 'vi_VN',
  });
  return rows
    .filter((r) => r.key && (r.type === 'city' || r.type === 'region'))
    .map((r) => ({
      type: r.type as 'city' | 'region',
      key: r.key!,
      name: r.region && r.type === 'city' ? `${r.name}, ${r.region}` : r.name,
    }));
}
