import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { withGuard } from '@/lib/auth/guard';

export const runtime = 'nodejs';

const Patch = z.union([
  z.object({ role: z.enum(['admin', 'member', 'viewer']) }),
  z.object({ disabled: z.boolean() }),
  z.object({ password: z.string().min(12, 'Mật khẩu phải từ 12 ký tự').max(200) }),
]);

/**
 * Còn bao nhiêu quản trị viên đang hoạt động, KHÔNG tính người này.
 *
 * Dùng để chặn tự khoá cửa: hạ vai trò hoặc khoá người quản trị cuối cùng thì
 * không còn ai vào được trang quản lý người dùng nữa, và cách duy nhất cứu là
 * sửa thẳng database.
 */
async function otherActiveAdmins(exceptId: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM app_user
     WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1`,
    [exceptId],
  );
  return rows[0]?.n ?? 0;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withGuard(async () => {
    const me = await requireAdmin();
    const { id } = await ctx.params;
    const parsed = Patch.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 },
      );
    }
    const d = parsed.data;

    const { rows: target } = await db.query(
      'SELECT id, role, disabled_at FROM app_user WHERE id = $1', [id],
    );
    if (!target[0]) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });

    if ('role' in d) {
      if (target[0].role === 'admin' && d.role !== 'admin' && await otherActiveAdmins(id) === 0) {
        return NextResponse.json(
          { error: 'Đây là quản trị viên duy nhất còn hoạt động. Cấp quyền admin cho người khác trước.' },
          { status: 409 },
        );
      }
      await db.query('UPDATE app_user SET role = $2::user_role_t WHERE id = $1', [id, d.role]);
      return NextResponse.json({ ok: true });
    }

    if ('disabled' in d) {
      if (id === me.id && d.disabled) {
        return NextResponse.json({ error: 'Không tự khoá tài khoản của chính mình' }, { status: 409 });
      }
      if (d.disabled && target[0].role === 'admin' && await otherActiveAdmins(id) === 0) {
        return NextResponse.json(
          { error: 'Đây là quản trị viên duy nhất còn hoạt động.' }, { status: 409 },
        );
      }
      await db.query(
        'UPDATE app_user SET disabled_at = $2 WHERE id = $1',
        [id, d.disabled ? new Date() : null],
      );
      return NextResponse.json({ ok: true });
    }

    // Quản trị viên đặt lại mật khẩu cho người khác.
    const hash = await bcrypt.hash(d.password, 10);
    await db.query('UPDATE app_user SET password_hash = $2 WHERE id = $1', [id, hash]);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withGuard(async () => {
    const me = await requireAdmin();
    const { id } = await ctx.params;

    if (id === me.id) {
      return NextResponse.json({ error: 'Không tự xoá tài khoản của chính mình' }, { status: 409 });
    }

    // Xoá người dùng kéo theo ad_account của họ (ON DELETE CASCADE) — mất cả
    // token lẫn toàn bộ lịch sử số liệu. Chặn lại và hướng sang khoá tài khoản.
    const { rows } = await db.query(
      'SELECT count(*)::int n FROM ad_account WHERE owner_id = $1', [id],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      return NextResponse.json({
        error: `Tài khoản này đang sở hữu ${rows[0].n} tài khoản quảng cáo. `
          + `Xoá sẽ mất cả số liệu lịch sử của chúng. Dùng "Khoá" thay vì xoá.`,
      }, { status: 409 });
    }

    const { rowCount } = await db.query('DELETE FROM app_user WHERE id = $1', [id]);
    if ((rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
