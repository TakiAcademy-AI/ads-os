import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { clientIp, checkRate, recordAttempt } from '@/lib/auth/rate-limit';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const ip = clientIp(req);

  // Chặn dò mật khẩu TRƯỚC khi so hash. Không có bước này thì thử bao nhiêu
  // lần cũng được — đã kiểm chứng trên production: 5 lần sai liên tiếp, cả 5
  // đều trả 401 như nhau, không có gì cản.
  const rate = await checkRate(email, ip);
  if (rate.blocked) {
    return NextResponse.json(
      { error: rate.reason ?? 'Thử lại sau ít phút' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const { rows } = await db.query(
    `SELECT id, email, name, role, password_hash, disabled_at
     FROM app_user WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  // So sánh hash kể cả khi không có user, để thời gian phản hồi không lộ
  // email nào tồn tại.
  const hash = user?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(parsed.data.password, hash);

  if (!user || !ok) {
    await recordAttempt(email, ip, false);
    return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  }

  // Tài khoản bị khoá: KHÔNG tính là đăng nhập sai — mật khẩu đúng mà — nên
  // không để nó ăn vào hạn mức dò. Nhưng cũng không cho vào, và nói rõ lý do
  // thay vì báo sai mật khẩu để người dùng khỏi đi đổi mật khẩu vô ích.
  if (user.disabled_at) {
    await recordAttempt(email, ip, true);
    return NextResponse.json(
      { error: 'Tài khoản đã bị khoá. Liên hệ quản trị viên.' }, { status: 403 },
    );
  }

  await recordAttempt(email, ip, true);
  await db.query('UPDATE app_user SET last_login_at = NOW() WHERE id = $1', [user.id])
    .catch(() => {});

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role;
  await session.save();

  return NextResponse.json({ ok: true });
}
