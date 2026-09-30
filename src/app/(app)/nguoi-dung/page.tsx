import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { UserManager, type UserRow } from './user-manager';
import { ChangePassword } from './change-password';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requireUser();

  // Không phải admin thì vẫn vào được trang này để ĐỔI MẬT KHẨU của mình —
  // chỉ phần danh sách người dùng mới bị giấu.
  const isAdmin = me.role === 'admin';

  let users: UserRow[] = [];
  if (isAdmin) {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.disabled_at, u.last_login_at, u.created_at,
              c.name AS created_by_name
       FROM app_user u
       LEFT JOIN app_user c ON c.id = u.created_by
       ORDER BY u.created_at`,
    );
    users = rows.map((r) => ({
      id: r.id, email: r.email, name: r.name, role: r.role,
      disabled: r.disabled_at !== null,
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      createdByName: r.created_by_name as string | null,
    }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Người dùng</h1>
          <p>
            {isAdmin
              ? 'Tài khoản đăng nhập, vai trò và mật khẩu'
              : 'Đổi mật khẩu của bạn'}
          </p>
        </div>
      </div>

      <ChangePassword />

      {isAdmin ? (
        <>
          <div className="note" style={{ maxWidth: 'none', marginBottom: 14 }}>
            <b>Ba vai trò.</b> <b>Chỉ xem</b> đọc được mọi số liệu nhưng mọi thao tác
            ghi đều bị từ chối — không tạo, sửa, xoá cấu hình, không kết nối tài khoản,
            không tạo quảng cáo. <b>Thành viên</b> làm được mọi thứ trừ quản lý người
            dùng. <b>Quản trị</b> làm được tất cả.
          </div>
          <UserManager users={users} meId={me.id} />
        </>
      ) : (
        <div className="card">
          <div className="empty">
            Chỉ quản trị viên xem được danh sách người dùng.
          </div>
        </div>
      )}
    </>
  );
}
