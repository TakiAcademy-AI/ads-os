import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { clientIp, checkRate, recordAttempt } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({
  current: z.string().min(1),
  next: z.string().min(12, 'Mật khẩu mới phải từ 12 ký tự').max(200),
});

/**
 * Đổi mật khẩu của chính mình.
 *
 * Bắt nhập mật khẩu hiện tại — nếu không, ai mượn được máy đang mở sẵn phiên
 * là chiếm luôn tài khoản vĩnh viễn. Và vẫn tính vào hạn mức dò mật khẩu, vì
 * đây cũng là một chỗ đoán mật khẩu được.
 */
export async function POST(req: Request) {
  const me = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 },
    );
  }

  const ip = clientIp(req);
  const rate = await checkRate(me.email, ip);
  if (rate.blocked) {
    return NextResponse.json(
      { error: rate.reason ?? 'Thử lại sau ít phút' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const { rows } = await db.query(
    'SELECT password_hash FROM app_user WHERE id = $1', [me.id],
  );
  const ok = await bcrypt.compare(parsed.data.current, rows[0]?.password_hash ?? '');
  if (!ok) {
    await recordAttempt(me.email, ip, false);
    return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 401 });
  }

  if (parsed.data.current === parsed.data.next) {
    return NextResponse.json({ error: 'Mật khẩu mới phải khác mật khẩu cũ' }, { status: 400 });
  }

  await recordAttempt(me.email, ip, true);
  const hash = await bcrypt.hash(parsed.data.next, 10);
  await db.query('UPDATE app_user SET password_hash = $2 WHERE id = $1', [me.id, hash]);
  return NextResponse.json({ ok: true });
}
