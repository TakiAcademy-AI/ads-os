// Tra cứu sở thích và tỉnh/thành của Facebook, cho ô tìm kiếm trong mẫu quảng cáo.
//
// Phải đi qua máy chủ chứ không gọi thẳng từ trình duyệt: lộ token quảng cáo ra
// phía người dùng là mất cả tài khoản, không chỉ một trang.

import { requireUser } from '@/lib/session';
import { readToken } from '@/lib/ads/token';
import { searchInterests, searchLocations } from '@/lib/ads/targeting';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const q = (url.searchParams.get('q') ?? '').trim();
  const country = url.searchParams.get('country') ?? 'VN';

  if (kind !== 'interest' && kind !== 'location') {
    return Response.json({ error: 'kind phải là interest hoặc location' }, { status: 400 });
  }
  // Một ký tự trả về hàng nghìn kết quả vô nghĩa và tốn một lượt gọi API.
  if (q.length < 2) return Response.json({ results: [] });

  // Tra cứu nhắm đối tượng không gắn với tài khoản quảng cáo nào — chỉ cần một
  // token Facebook còn hiệu lực. Lấy tài khoản mới kết nối nhất.
  const { rows } = await db.query(
    `SELECT id FROM ad_account
     WHERE owner_id = $1 AND platform = 'facebook' AND encrypted_token IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [user.id],
  );
  if (!rows[0]) {
    return Response.json({ error: 'Chưa kết nối tài khoản Facebook nào' }, { status: 400 });
  }
  const token = await readToken(rows[0].id);
  if (!token) return Response.json({ error: 'Không đọc được token' }, { status: 400 });

  try {
    const results = kind === 'interest'
      ? await searchInterests(token, q)
      : await searchLocations(token, q, country);
    return Response.json({ results });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 },
    );
  }
}
