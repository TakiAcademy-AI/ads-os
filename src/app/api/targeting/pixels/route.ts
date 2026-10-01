// Danh sách pixel của tài khoản quảng cáo, để mẫu mục tiêu Chuyển đổi chọn.
//
// Không lưu vào DB: pixel do người dùng tạo/xoá bên Facebook, bản sao trong máy
// sẽ cũ đi mà không ai biết. Đọc trực tiếp mỗi lần mở form.

import { requireUser } from '@/lib/session';
import { readToken } from '@/lib/ads/token';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';

export async function GET() {
  const user = await requireUser();

  const { rows } = await db.query(
    `SELECT id, external_id FROM ad_account
     WHERE owner_id = $1 AND platform = 'facebook' AND encrypted_token IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [user.id],
  );
  if (!rows[0]) {
    return Response.json({ error: 'Chưa kết nối tài khoản Facebook nào' }, { status: 400 });
  }
  const token = await readToken(rows[0].id);
  if (!token) return Response.json({ error: 'Không đọc được token' }, { status: 400 });

  const u = new URL(`${GRAPH}/${VERSION}/${rows[0].external_id}/adspixels`);
  u.searchParams.set('fields', 'id,name,last_fired_time');
  u.searchParams.set('limit', '50');

  try {
    const res = await fetch(u, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string; name: string; last_fired_time?: string }[];
      error?: { message?: string };
    };
    // Facebook trả HTTP 200 kèm error cho một số lỗi tài khoản — xét error trước.
    if (json.error) return Response.json({ error: json.error.message }, { status: 502 });
    if (!res.ok) return Response.json({ error: `Facebook trả HTTP ${res.status}` }, { status: 502 });
    return Response.json({ pixels: json.data ?? [] });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 },
    );
  }
}
