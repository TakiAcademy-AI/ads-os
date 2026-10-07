import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { getTikTokAuth } from '@/lib/ads/tiktok-token';
import { listIdentityPosts } from '@/lib/ads/tiktok';

export const runtime = 'nodejs';

/** Bài đăng của một kênh TikTok — bước "chọn bài" của Đăng nhanh. */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const account = q.get('account') ?? '';
  const identity = q.get('identity') ?? '';
  const type = q.get('type') ?? '';
  const bcId = q.get('bc') || null;
  const cursor = Number(q.get('cursor') ?? '') || undefined;
  if (!/^[0-9a-f-]{36}$/i.test(account) || !identity || !/^[A-Z_]+$/.test(type)) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { rows } = await db.query(
    `SELECT id, external_id FROM ad_account WHERE id = $1 AND owner_id = $2 AND platform = 'tiktok'`, [account, user.id],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy tài khoản TikTok' }, { status: 404 });
  try {
    const r = await listIdentityPosts(await getTikTokAuth(rows[0].id), rows[0].external_id, { id: identity, type, bcId }, cursor);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 });
  }
}
