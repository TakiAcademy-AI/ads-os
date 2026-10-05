import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  role?: 'admin' | 'member' | 'viewer';
  /**
   * Chống CSRF cho luồng OAuth. Sinh lúc bắt đầu, đối chiếu ở callback rồi xoá.
   * Để trong session cookie nên tự động gắn với đúng người dùng đã đăng nhập —
   * kẻ tấn công không dựng được state hợp lệ cho phiên của người khác.
   */
  fbOauthState?: string;
  /** Cùng vai trò với fbOauthState, cho luồng OAuth của Google. Tách riêng để
   *  hai luồng chạy song song không ghi đè state của nhau. */
  googleOauthState?: string;
  /** Cùng vai trò, cho luồng OAuth của TikTok. */
  tiktokOauthState?: string;
  /** Tài khoản QC đang xem. Xác thực lại quyền sở hữu mỗi lần đọc. */
  accountId?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD ?? '',
  cookieName: 'ads_os_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  if (!sessionOptions.password) throw new Error('Thiếu SESSION_PASSWORD');
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export type Role = 'admin' | 'member' | 'viewer';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Dùng trong server component/route cần đăng nhập. Chưa đăng nhập → /login. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session.userId) redirect('/login');

  const { rows } = await db.query<CurrentUser & { disabled_at: Date | null }>(
    `SELECT id, email, name, role, disabled_at FROM app_user WHERE id = $1`,
    [session.userId],
  );
  const user = rows[0];
  // Tài khoản bị khoá phải mất quyền NGAY, không chờ cookie hết hạn. Kiểm ở
  // đây vì mọi trang và mọi route đều đi qua requireUser().
  if (user?.disabled_at) redirect('/login?disabled=1');
  // Tài khoản bị xoá nhưng cookie còn (vd sau khi tạo lại database).
  //
  // KHÔNG gọi session.destroy() ở đây: requireUser() chạy trong Server
  // Component, mà Next chỉ cho sửa cookie trong Server Action hoặc Route
  // Handler — gọi ở đây làm MỌI trang ném lỗi thay vì chuyển hướng.
  // Cookie cũ để nguyên thì vô hại: nó chỉ tra không ra người dùng, và lần
  // đăng nhập sau sẽ ghi đè. Muốn xoá hẳn thì gọi POST /api/auth/logout.
  if (!user) redirect('/login');
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * Bắt buộc quyền GHI. viewer bị từ chối.
 *
 * Cột role có từ migration 001 nhưng TRƯỚC ĐÂY KHÔNG ĐƯỢC KIỂM Ở ĐÂU CẢ —
 * 'viewer' xoá được cấu hình, ngắt được kết nối, tạo được quảng cáo. Enum chỉ
 * là trang trí. Mọi route có tác dụng phụ phải gọi hàm này thay cho requireUser.
 */
export async function requireWriter(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === 'viewer') {
    throw new ForbiddenError('Tài khoản chỉ có quyền xem, không thực hiện được thao tác này');
  }
  return user;
}

/** Bắt buộc quyền quản trị. Dùng cho quản lý người dùng. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new ForbiddenError('Chỉ quản trị viên mới làm được việc này');
  }
  return user;
}

/**
 * Lỗi thiếu quyền.
 *
 * Ném lỗi chứ không redirect: redirect trong route handler sẽ biến 403 thành
 * 307 và client không phân biệt được "chưa đăng nhập" với "không đủ quyền".
 * Bọc bằng withGuard() ở lib/auth/guard.ts để thành phản hồi 403 tử tế.
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
