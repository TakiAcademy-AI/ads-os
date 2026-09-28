import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  const { rows } = await db.query(
    `SELECT id, email, name, role, password_hash FROM app_user WHERE email = $1`,
    [parsed.data.email.toLowerCase()],
  );
  const user = rows[0];
  // So sánh hash kể cả khi không có user, để thời gian phản hồi không lộ
  // email nào tồn tại.
  const hash = user?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(parsed.data.password, hash);

  if (!user || !ok) {
    return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role;
  await session.save();

  return NextResponse.json({ ok: true });
}
