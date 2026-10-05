// Dựng phiên làm việc Google Ads từ một bản ghi ad_account.
//
// Tách riêng vì việc này cần cả database (đọc refresh token đã mã hoá) lẫn
// mạng (đổi lấy access token) — google.ts cố ý chỉ thuần API.

import { db } from '../db';
import { readToken } from './token';
import { googleOauthConfig, developerToken, accessTokenFrom } from './google-oauth';
import { parseServiceAccountKey, saAccessToken } from './google-sa';
import type { GoogleAuth } from './google';

export interface GoogleSession {
  auth: GoogleAuth;
  customerId: string;
  currency: string;
}

export class GoogleSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSetupError';
  }
}

/**
 * Dựng phiên cho một tài khoản quảng cáo Google.
 *
 * Ném GoogleSetupError với thông điệp đọc được cho từng nguyên nhân thiếu —
 * gộp hết thành "không kết nối được" thì người dùng không biết phải sửa gì.
 */
export async function googleSession(adAccountId: string): Promise<GoogleSession> {
  const { rows } = await db.query(
    `SELECT external_id, currency, login_customer_id, token_source
     FROM ad_account WHERE id = $1 AND platform = 'google'`,
    [adAccountId],
  );
  if (!rows[0]) throw new GoogleSetupError('Không tìm thấy tài khoản Google này');

  // encrypted_token của Google giữ REFRESH token (đăng nhập Google) hoặc file
  // khoá JSON (service account) — tuỳ token_source.
  const secret = await readToken(adAccountId);
  if (!secret) {
    throw new GoogleSetupError('Chưa có thông tin xác thực — kết nối lại tài khoản Google');
  }

  let accessToken: string;
  if (rows[0].token_source === 'service_account') {
    try {
      accessToken = await saAccessToken(parseServiceAccountKey(secret));
    } catch (e) {
      throw new GoogleSetupError(e instanceof Error ? e.message : String(e));
    }
  } else {
    // Không cần origin ở đây vì chỉ dùng clientId/clientSecret để đổi token.
    const cfg = googleOauthConfig('');
    if (!cfg) {
      throw new GoogleSetupError('Thiếu GOOGLE_ADS_CLIENT_ID hoặc GOOGLE_ADS_CLIENT_SECRET.');
    }
    try {
      accessToken = await accessTokenFrom(cfg, secret);
    } catch (e) {
      throw new GoogleSetupError(
        `Không đổi được refresh token lấy access token: `
        + `${e instanceof Error ? e.message : String(e)}. `
        + `Thường là do người dùng đã thu hồi quyền — cần kết nối lại.`,
      );
    }
  }

  return {
    auth: {
      accessToken,
      developerToken: developerToken() || undefined,
      loginCustomerId: rows[0].login_customer_id as string | null,
    },
    customerId: rows[0].external_id as string,
    currency: rows[0].currency as string,
  };
}
