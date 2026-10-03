import { requireUser, requireWriter } from '@/lib/session';
import { listPages, fetchPages, savePages, deletePages } from '@/lib/ads/pages';
import { readToken } from '@/lib/ads/token';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/** Page đã lưu, để giao diện cấu hình chọn nguồn bài viết. */
export async function GET() {
  const user = await requireUser();
  return Response.json({ pages: await listPages(user.id) });
}

/**
 * Nạp lại danh sách Page từ Facebook.
 *
 * Cần thiết khi người dùng vừa tạo Page mới hoặc vừa cấp thêm quyền — bảng
 * fb_page chỉ được ghi lúc kết nối, không tự biết Page mới xuất hiện.
 */
export async function POST() {
  const user = await requireWriter();

  // Token dán tay là token chính — ưu tiên nó, rồi mới tới tài khoản cập nhật gần nhất.
  const { rows } = await db.query(
    `SELECT id FROM ad_account
     WHERE owner_id = $1 AND platform = 'facebook' AND encrypted_token IS NOT NULL
     ORDER BY (token_source = 'manual') DESC, updated_at DESC LIMIT 1`,
    [user.id],
  );
  if (!rows[0]) {
    return Response.json({ error: 'Chưa kết nối tài khoản Facebook nào' }, { status: 400 });
  }

  const token = await readToken(rows[0].id);
  if (!token) return Response.json({ error: 'Không đọc được token' }, { status: 400 });

  try {
    const fetched = await fetchPages(token);
    if (fetched.length === 0) {
      // Mảng rỗng ở đây gần như luôn là thiếu quyền, không phải không có Page.
      return Response.json({
        error: 'Facebook không trả về Page nào. Thường là do chưa cấp quyền '
          + '"Quản lý Trang" — bấm Kết nối lại và tick đủ các Page.',
      }, { status: 400 });
    }
    await savePages(user.id, fetched);
    return Response.json({ pages: await listPages(user.id) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 },
    );
  }
}

/** Gỡ toàn bộ Page đã nạp. Muốn dùng lại thì bấm Nạp lại Page hoặc kết nối lại. */
export async function DELETE() {
  const user = await requireWriter();
  return Response.json({ removed: await deletePages(user.id) });
}
