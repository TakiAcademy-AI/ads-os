import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from '@/lib/session';

/**
 * Chốt chặn trung tâm cho vai trò "chỉ xem".
 *
 * VÌ SAO CẦN, KHI MỖI ROUTE ĐÃ GỌI requireWriter()?
 *
 * Hai lý do. Một: quên một route là thủng, và danh sách route còn dài ra theo
 * thời gian — chốt ở đây bắt được cả những route chưa tồn tại. Hai:
 * requireWriter() NÉM lỗi, mà route không bắt thì Next trả 500 trống trơn;
 * người dùng chỉ thấy "thao tác thất bại" không rõ lý do.
 *
 * ĐÂY KHÔNG PHẢI LỚP BẢO VỆ DUY NHẤT. Vai trò đọc từ cookie phiên nên nó là
 * ảnh chụp lúc đăng nhập: hạ quyền một người đang online thì cookie của họ vẫn
 * ghi vai trò cũ cho tới khi đăng nhập lại. requireWriter() trong route mới là
 * nơi kiểm thật, vì nó đọc thẳng từ database.
 */

const sessionOptions = {
  password: process.env.SESSION_PASSWORD ?? '',
  cookieName: 'ads_os_session',
};

/** Route đổi dữ liệu. Khớp theo tiền tố đường dẫn. */
const MUTATING_PREFIXES = [
  '/api/configs', '/api/connections', '/api/templates',
  '/api/keys', '/api/pages', '/api/ads', '/api/users', '/api/campaigns',
];

/**
 * Loại trừ: các đường dẫn nằm trong tiền tố trên nhưng chỉ ĐỌC.
 * Giữ danh sách này ngắn — mỗi mục là một lỗ khoét vào chốt chặn.
 */
function isReadOnly(path: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    // Ngoại lệ: OAuth start/callback là GET nhưng THÊM tài khoản quảng cáo.
    return !/^\/api\/connections\/(facebook|google|tiktok)\/(mcp\/)?(start|callback)/.test(path);
  }
  return false;
}

/**
 * Trang chủ "/" cho người CHƯA đăng nhập là trang giới thiệu, không phải màn
 * hình đăng nhập. Google từ chối duyệt OAuth consent screen khi trang chủ nằm
 * sau đăng nhập hoặc không nói app làm gì. Rewrite chứ không redirect: URL
 * vẫn là "/" nên bot của Google thấy nội dung ngay tại địa chỉ đã khai.
 */
async function landingForGuests(req: NextRequest): Promise<NextResponse> {
  if (!sessionOptions.password) return NextResponse.next();
  try {
    const session = await getIronSession<SessionData>(req, NextResponse.next(), sessionOptions);
    if (session.userId) return NextResponse.next();
  } catch {
    // Cookie hỏng — coi như chưa đăng nhập.
  }
  return NextResponse.rewrite(new URL('/gioi-thieu', req.url));
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/') return landingForGuests(req);
  if (!MUTATING_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (isReadOnly(pathname, req.method)) return NextResponse.next();
  if (!sessionOptions.password) return NextResponse.next();

  let role: string | undefined;
  try {
    const res = NextResponse.next();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    role = session.role;
  } catch {
    // Cookie hỏng hoặc không giải mã được — để requireUser() xử lý, đừng đoán.
    return NextResponse.next();
  }

  // Chưa đăng nhập thì để requireUser() chuyển hướng như bình thường; ở đây
  // chỉ lo phân quyền, không lo xác thực.
  if (role === 'viewer') {
    return NextResponse.json(
      { error: 'Tài khoản chỉ có quyền xem, không thực hiện được thao tác này' },
      { status: 403 },
    );
  }
  if (role !== 'admin' && pathname.startsWith('/api/users')) {
    return NextResponse.json(
      { error: 'Chỉ quản trị viên mới quản lý được người dùng' },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/api/:path*'],
};
