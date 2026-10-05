import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { googleSession, GoogleSetupError } from '@/lib/ads/google-session';

export const runtime = 'nodejs';

const HOST = 'https://googleads.googleapis.com';
const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';

/**
 * Gợi ý vị trí nhắm mục tiêu theo tên, để Đăng nhanh Google chọn tỉnh/thành.
 *
 * Phải gọi Google chứ không tự giữ bảng ID: cùng tên "Hà Nội" Google có hai mục
 * (9040331 theo địa giới mới, 1028580 theo cũ) — tên chuẩn (canonical) mới
 * phân biệt được, và danh sách thay đổi theo địa giới hành chính.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const accountId = url.searchParams.get('account') ?? '';
  if (q.length < 2) return NextResponse.json({ items: [] });

  const { rows } = await db.query(
    `SELECT id FROM ad_account WHERE id = $1 AND owner_id = $2 AND platform = 'google'`,
    [accountId, user.id],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Tài khoản Google không hợp lệ' }, { status: 404 });

  try {
    const s = await googleSession(rows[0].id);
    const res = await fetch(`${HOST}/${VERSION}/geoTargetConstants:suggest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.auth.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'vi', countryCode: 'VN', locationNames: { names: [q] } }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      geoTargetConstantSuggestions?: { geoTargetConstant?: {
        id?: string; name?: string; targetType?: string; canonicalName?: string; status?: string;
      } }[];
    };
    const items = (j.geoTargetConstantSuggestions ?? [])
      .map((x) => x.geoTargetConstant)
      .filter((g) => g?.id && g.status === 'ENABLED')
      .slice(0, 10)
      .map((g) => ({ id: g!.id!, name: g!.name ?? '', type: g!.targetType ?? '', canonical: g!.canonicalName ?? '' }));
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof GoogleSetupError || e instanceof Error ? e.message : 'Lỗi không rõ';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
