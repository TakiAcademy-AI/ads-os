// Điểm kích hoạt cho systemd timer.
//
// Bảo vệ bằng CRON_TRIGGER_TOKEN chứ không bằng phiên đăng nhập — timer không
// có cookie. Không đặt token thì endpoint TỪ CHỐI hẳn, không mở toang.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runDueConfigs } from '@/lib/automation/runner';

export const runtime = 'nodejs';
export const maxDuration = 600;

function authorized(req: Request): boolean {
  const expected = process.env.CRON_TRIGGER_TOKEN;
  if (!expected) return false;

  const header = req.headers.get('authorization') ?? '';
  const got = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!got) return false;

  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 401 });
  }
  const result = await runDueConfigs();
  return NextResponse.json(result);
}
