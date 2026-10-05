import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { publicOrigin } from '@/lib/public-origin';
import { requireWriter, getSession } from '@/lib/session';
import { tiktokOauthConfig, tiktokAuthUrl } from '@/lib/ads/tiktok-oauth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  // GET nhưng CÓ tác dụng phụ (thêm tài khoản) — viewer không được phép.
  await requireWriter();
  const cfg = tiktokOauthConfig(publicOrigin(req));
  if (!cfg) {
    return NextResponse.json({ error: 'Chưa cấu hình TIKTOK_APP_ID và TIKTOK_APP_SECRET trong .env' }, { status: 503 });
  }
  const session = await getSession();
  const state = randomBytes(24).toString('base64url');
  session.tiktokOauthState = state;
  await session.save();
  return NextResponse.redirect(tiktokAuthUrl(cfg, state));
}
