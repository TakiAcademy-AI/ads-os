import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { withGuard } from '@/lib/auth/guard';

export const runtime = 'nodejs';

export const NewUser = z.object({
  email: z.string().email().max(160),
  name: z.string().min(1).max(80),
  role: z.enum(['admin', 'member', 'viewer']),
  // 12 ký tự là mức tối thiểu có ý nghĩa với bcrypt cost 10 và không có 2FA.
  password: z.string().min(12, 'Mật khẩu phải từ 12 ký tự').max(200),
});

export async function GET() {
  return withGuard(async () => {
    await requireAdmin();
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.disabled_at, u.last_login_at, u.created_at,
              c.name AS created_by_name
       FROM app_user u
       LEFT JOIN app_user c ON c.id = u.created_by
       ORDER BY u.created_at`,
    );
    return NextResponse.json({
      users: rows.map((r) => ({
        id: r.id, email: r.email, name: r.name, role: r.role,
        disabled: r.disabled_at !== null,
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
        createdByName: r.created_by_name as string | null,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withGuard(async () => {
    const me = await requireAdmin();
    const parsed = NewUser.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 },
      );
    }

    const hash = await bcrypt.hash(parsed.data.password, 10);
    try {
      const { rows } = await db.query(
        `INSERT INTO app_user (email, name, role, password_hash, created_by)
         VALUES ($1,$2,$3::user_role_t,$4,$5) RETURNING id`,
        [parsed.data.email.toLowerCase(), parsed.data.name, parsed.data.role, hash, me.id],
      );
      return NextResponse.json({ id: rows[0].id });
    } catch (e) {
      const msg = e instanceof Error && e.message.includes('duplicate key')
        ? 'Email này đã có tài khoản' : 'Không tạo được tài khoản';
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  });
}
