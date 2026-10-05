// Xác thực Google Ads API bằng SERVICE ACCOUNT.
//
// VÌ SAO CÓ ĐƯỜNG NÀY: đăng nhập Google qua popup có thể bị chính Google chặn
// ở bước kiểm tra tài khoản (trang accounts.google.com/v3/signin/rejected —
// bắt tạo passkey rồi chờ tới 7 ngày). Bước đó nằm hoàn toàn bên Google, app
// không can thiệp được. Service account không cần người đăng nhập: người dùng
// thêm email của nó vào Google Ads (Quản trị → Quyền truy cập và bảo mật) là
// xong. Không có consent screen nên cũng không cần Google duyệt app.
// https://developers.google.com/google-ads/api/docs/oauth/service-accounts
//
// Cấp truy cập API (Test/Explorer/Basic) lấy theo PROJECT CHỨA SERVICE ACCOUNT,
// không theo OAuth client. Project mới chỉ có Test.
//
// Luồng: ký JWT bằng private key trong file JSON → đổi lấy access token 1 giờ.
// Không có refresh token; mỗi lần cần thì ký JWT mới.

import { createSign } from 'node:crypto';
import { GOOGLE_SCOPES } from './google-oauth';

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

/**
 * Đọc và kiểm tra file khoá JSON. Ném lỗi tiếng Việt chỉ rõ chỗ sai — người
 * dùng hay dán nhầm file OAuth client (client_secret_*.json) vào đây.
 */
export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw.trim());
  } catch {
    throw new Error('Không đọc được JSON. Dán nguyên nội dung file khoá .json của service account.');
  }
  if (j.web || j.installed) {
    throw new Error(
      'Đây là file OAuth client (client_secret…json), không phải khoá service account. '
      + 'Vào IAM & Admin → Service Accounts → chọn service account → Keys → Add key → JSON.',
    );
  }
  if (j.type !== 'service_account' || typeof j.client_email !== 'string'
      || typeof j.private_key !== 'string') {
    throw new Error('File không phải khoá service account (thiếu type, client_email hoặc private_key).');
  }
  return {
    client_email: j.client_email,
    private_key: j.private_key,
    // KHÔNG lấy token_uri từ file: server sẽ POST tới địa chỉ đó và trả lỗi
    // của nó về cho người dán — tức là cho người dùng bắt server gọi bất kỳ
    // địa chỉ nội bộ nào (SSRF). Khoá Google luôn dùng một địa chỉ cố định.
    token_uri: DEFAULT_TOKEN_URI,
    project_id: typeof j.project_id === 'string' ? j.project_id : undefined,
  };
}

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString('base64url');
}

/** Đổi khoá service account lấy access token sống 1 giờ. */
export async function saAccessToken(key: ServiceAccountKey): Promise<string> {
  // Luôn dùng địa chỉ cố định, kể cả khi khoá đã lưu từ trước mang token_uri khác.
  const tokenUri = DEFAULT_TOKEN_URI;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: GOOGLE_SCOPES.join(' '),
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));

  let signature: string;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    signature = signer.sign(key.private_key).toString('base64url');
  } catch {
    throw new Error('private_key trong file khoá bị hỏng — tạo khoá JSON mới cho service account.');
  }

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string; error?: string; error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const why = json.error_description || json.error || `HTTP ${res.status}`;
    // invalid_grant gần như luôn là khoá đã bị xoá/vô hiệu hoá trên Cloud
    // Console, hoặc đồng hồ server lệch — thông điệp gốc không nói vậy.
    throw new Error(
      json.error === 'invalid_grant'
        ? `Google từ chối khoá service account (${why}). Khoá có thể đã bị xoá hoặc `
          + 'service account bị vô hiệu hoá — tạo khoá JSON mới rồi kết nối lại.'
        : `Không đổi được khoá service account lấy access token: ${why}`,
    );
  }
  return json.access_token;
}
