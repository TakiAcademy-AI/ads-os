import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  role?: 'admin' | 'member' | 'viewer';
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

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
}

/** Dùng trong server component/route cần đăng nhập. Chưa đăng nhập → /login. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session.userId) redirect('/login');

  const { rows } = await db.query<CurrentUser>(
    `SELECT id, email, name, role FROM app_user WHERE id = $1`,
    [session.userId],
  );
  const user = rows[0];
  // Tài khoản bị xoá nhưng cookie còn (vd sau khi tạo lại database).
  //
  // KHÔNG gọi session.destroy() ở đây: requireUser() chạy trong Server
  // Component, mà Next chỉ cho sửa cookie trong Server Action hoặc Route
  // Handler — gọi ở đây làm MỌI trang ném lỗi thay vì chuyển hướng.
  // Cookie cũ để nguyên thì vô hại: nó chỉ tra không ra người dùng, và lần
  // đăng nhập sau sẽ ghi đè. Muốn xoá hẳn thì gọi POST /api/auth/logout.
  if (!user) redirect('/login');
  return user;
}
