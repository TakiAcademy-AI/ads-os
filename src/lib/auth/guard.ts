// Biến ForbiddenError thành phản hồi HTTP 403 tử tế.
//
// Không có lớp bọc này thì mọi route phải tự try/catch, và chỉ cần quên một
// chỗ là lỗi thiếu quyền hiện ra thành màn hình 500 — người dùng không biết
// mình bị từ chối vì lý do gì.

import { NextResponse } from 'next/server';
import { ForbiddenError } from '../session';

export async function withGuard<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
}
