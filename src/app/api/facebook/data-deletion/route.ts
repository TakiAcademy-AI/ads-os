// Endpoint Facebook gọi khi người dùng yêu cầu xoá dữ liệu.
//
// CÔNG KHAI, không đăng nhập — Facebook gọi từ server của họ, không có cookie.
// Thay vào đó xác thực bằng chữ ký HMAC trong signed_request, ký bằng App Secret.
//
// Tài liệu: Facebook POST form-encoded `signed_request` = <chữ ký>.<payload>,
// cả hai mã base64url. Phải trả JSON { url, confirmation_code }.

import { NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

interface SignedPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Kiểm chữ ký rồi trả payload. null = không hợp lệ.
 *
 * Bất kỳ ai cũng gọi được endpoint này, nên chữ ký là thứ DUY NHẤT ngăn người
 * lạ xoá dữ liệu của người khác. Không được bỏ qua bước này.
 */
function verify(signedRequest: string, appSecret: string): SignedPayload | null {
  const dot = signedRequest.indexOf('.');
  if (dot <= 0) return null;

  const sigPart = signedRequest.slice(0, dot);
  const payloadPart = signedRequest.slice(dot + 1);

  const expected = createHmac('sha256', appSecret).update(payloadPart).digest();
  const got = b64urlToBuffer(sigPart);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;

  try {
    const payload = JSON.parse(b64urlToBuffer(payloadPart).toString('utf8')) as SignedPayload;
    // Facebook chỉ ký bằng HMAC-SHA256. Giá trị khác là dấu hiệu bất thường.
    if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const appSecret = process.env.FB_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: 'Chưa cấu hình FB_APP_SECRET' }, { status: 503 });
  }

  // Facebook gửi form-encoded. Chấp nhận cả JSON cho tiện kiểm thử.
  let signed = '';
  const ctype = req.headers.get('content-type') ?? '';
  if (ctype.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { signed_request?: string };
    signed = body.signed_request ?? '';
  } else {
    const form = await req.formData().catch(() => null);
    signed = String(form?.get('signed_request') ?? '');
  }

  if (!signed) {
    return NextResponse.json({ error: 'Thiếu signed_request' }, { status: 400 });
  }

  const payload = verify(signed, appSecret);
  if (!payload?.user_id) {
    return NextResponse.json({ error: 'Chữ ký không hợp lệ' }, { status: 400 });
  }

  const fbUserId = payload.user_id;
  const code = randomBytes(12).toString('hex');
  const origin = new URL(req.url).origin;
  const statusUrl = `${origin}/xoa-du-lieu?ma=${code}`;

  try {
    await db.query(
      `INSERT INTO deletion_request (confirmation_code, fb_user_id) VALUES ($1, $2)`,
      [code, fbUserId],
    );

    // Xoá kết nối do chính người này cấp quyền. CASCADE kéo theo chiến dịch,
    // số liệu, lịch sử revision, nhật ký và cấu hình gắn với tài khoản đó.
    const { rowCount } = await db.query(
      `DELETE FROM ad_account WHERE fb_user_id = $1`,
      [fbUserId],
    );

    await db.query(
      `UPDATE deletion_request
       SET status = 'completed', accounts_deleted = $2, completed_at = NOW()
       WHERE confirmation_code = $1`,
      [code, rowCount ?? 0],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(
      `UPDATE deletion_request SET status = 'failed', error_message = $2
       WHERE confirmation_code = $1`,
      [code, msg],
    ).catch(() => {});
    // Vẫn trả 200 kèm mã: Facebook cần mã để người dùng tra cứu, còn lỗi thì
    // đã ghi lại để xử lý tay.
  }

  return NextResponse.json({ url: statusUrl, confirmation_code: code });
}

/** Mở bằng trình duyệt thì chỉ để kiểm tra endpoint còn sống. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    endpoint: 'facebook-data-deletion',
    method: 'POST',
    instructions: `${origin}/xoa-du-lieu`,
  });
}
