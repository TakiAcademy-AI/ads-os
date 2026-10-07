import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { getTikTokAuth } from '@/lib/ads/tiktok-token';
import { listIdentities } from '@/lib/ads/tiktok';

export const runtime = 'nodejs';

/** Kênh TikTok của một tài khoản quảng cáo — bước "chọn kênh" của Đăng nhanh. */
export async function GET(req: Request) {
  const user = await requireUser();
  const account = new URL(req.url).searchParams.get('account') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(account)) return NextResponse.json({ error: 'Tài khoản không hợp lệ' }, { status: 400 });
  const { rows } = await db.query(
    `SELECT id, external_id FROM ad_account WHERE id = $1 AND owner_id = $2 AND platform = 'tiktok'`, [account, user.id],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Không tìm thấy tài khoản TikTok' }, { status: 404 });
  try {
    return NextResponse.json({ identities: await listIdentities(await getTikTokAuth(rows[0].id), rows[0].external_id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 });
  }
}
