import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWriter } from '@/lib/session';
import { tiktokOauthConfig } from '@/lib/ads/tiktok-oauth';
import { listAuthorizedAdvertisers } from '@/lib/ads/tiktok';
import { saveTikTokAccounts } from '@/lib/ads/tiktok-connect';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  token: z.string().trim().min(20).max(500),
  /** Bắt buộc khi chưa cấu hình app — không có app_id/secret thì không tự liệt kê được. */
  advertiserIds: z.array(z.string().regex(/^\d+$/)).max(50).optional(),
});

/** Dán token TikTok (token chính). */
export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Token hoặc ID tài khoản không hợp lệ' }, { status: 400 });
  const { token } = parsed.data;

  try {
    let ids = parsed.data.advertiserIds ?? [];
    if (!ids.length) {
      const cfg = tiktokOauthConfig('');
      if (!cfg) {
        return NextResponse.json({ error: 'Chưa cấu hình app TikTok nên không tự tìm được tài khoản — nhập thêm ID tài khoản quảng cáo (advertiser ID).' }, { status: 400 });
      }
      ids = (await listAuthorizedAdvertisers(token, cfg.appId, cfg.secret)).map((a) => a.id);
    }
    if (!ids.length) return NextResponse.json({ error: 'Token này không có tài khoản quảng cáo nào.' }, { status: 400 });
    const r = await saveTikTokAccounts(user.id, token, ids, 'manual', token);
    return NextResponse.json({ saved: r.saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 400 });
  }
}
