import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { publicOrigin } from '@/lib/public-origin';
import { requireWriter, getSession } from '@/lib/session';
import { googleOauthConfig, developerToken, authUrl } from '@/lib/ads/google-oauth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  // GET nhưng CÓ tác dụng phụ: luồng này kết thúc bằng việc thêm tài khoản
  // quảng cáo vào hệ thống, nên viewer không được phép.
  await requireWriter();

  // publicOrigin chứ KHÔNG phải new URL(req.url).origin — sau nginx thì req.url
  // là localhost:3100 và redirect_uri gửi lên nền tảng sẽ sai.
  const origin = publicOrigin(req);
  const cfg = googleOauthConfig(origin);
  if (!cfg) {
    return NextResponse.json(
      { error: 'Chưa cấu hình GOOGLE_ADS_CLIENT_ID và GOOGLE_ADS_CLIENT_SECRET trong .env' },
      { status: 503 },
    );
  }
  // Chặn ngay ở đây thay vì để người dùng cấp quyền xong mới phát hiện thiếu —
  // developer token là thứ không có thì Google Ads API từ chối mọi lời gọi.
  if (!developerToken()) {
    return NextResponse.json(
      { error: 'Chưa có GOOGLE_ADS_DEVELOPER_TOKEN. Xin ở tài khoản quản lý Google Ads, mục API Center.' },
      { status: 503 },
    );
  }

  const session = await getSession();
  const state = randomBytes(24).toString('base64url');
  session.googleOauthState = state;
  await session.save();

  return NextResponse.redirect(authUrl(cfg, state));
}
