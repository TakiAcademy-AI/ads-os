import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireWriter, getSession } from '@/lib/session';
import { oauthConfig, authorizeUrl } from '@/lib/ads/facebook-oauth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  // GET nhưng CÓ tác dụng phụ: luồng này kết thúc bằng việc thêm tài khoản
  // quảng cáo vào hệ thống, nên viewer không được phép.
  await requireWriter();

  const origin = new URL(req.url).origin;
  const cfg = oauthConfig(origin);
  if (!cfg) {
    return NextResponse.json(
      { error: 'Chưa cấu hình FB_APP_ID và FB_APP_SECRET trong .env' },
      { status: 503 },
    );
  }

  const session = await getSession();
  const state = randomBytes(24).toString('base64url');
  session.fbOauthState = state;
  await session.save();

  return NextResponse.redirect(authorizeUrl(cfg, state));
}
