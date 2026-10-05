// Mặt tiền chung cho nhiều nền tảng.
//
// Lớp tự động hoá (auto-pause, budget-schedule) KHÔNG được biết nó đang nói
// chuyện với Facebook hay Google. Mọi khác biệt về đơn vị tiền, cách gọi API
// và ràng buộc riêng của từng nền tảng đều bị giấu sau đây.
//
// Ba khác biệt lớn nhất mà mặt tiền này che đi:
//   - Facebook nhận ngân sách theo đơn vị nhỏ nhất (đồng/cents); Google nhận
//     thẳng micros.
//   - Facebook dùng token dài hạn; Google phải đổi refresh token mỗi lần gọi.
//   - Google có ngân sách DÙNG CHUNG giữa nhiều chiến dịch; Facebook không có.

import { db } from '../db';
import { readToken } from './token';
import * as fbWrite from './facebook-write';
import * as gWrite from './google-write';
import { googleSession, GoogleSetupError } from './google-session';
import { GoogleAdsError } from './google';
import * as ttWrite from './tiktok-write';
import { TikTokError } from './tiktok';

export type Platform = 'facebook' | 'google' | 'tiktok';

/** Lỗi đã có thông điệp đọc được, dùng thẳng cho nhật ký. */
export class PlatformWriteError extends Error {
  constructor(message: string, readonly isPermission = false) {
    super(message);
    this.name = 'PlatformWriteError';
  }
}

interface AccountCtx {
  platform: Platform;
  externalId: string;
  currency: string;
}

async function ctxOf(adAccountId: string): Promise<AccountCtx> {
  const { rows } = await db.query(
    'SELECT platform, external_id, currency FROM ad_account WHERE id = $1',
    [adAccountId],
  );
  if (!rows[0]) throw new PlatformWriteError('Không tìm thấy tài khoản quảng cáo');
  return {
    platform: rows[0].platform as Platform,
    externalId: rows[0].external_id as string,
    currency: rows[0].currency as string,
  };
}

function wrap(e: unknown): PlatformWriteError {
  if (e instanceof fbWrite.FacebookWriteError) {
    return new PlatformWriteError(e.message, e.isPermission);
  }
  if (e instanceof GoogleAdsError) {
    return new PlatformWriteError(e.message, e.isAuthProblem);
  }
  if (e instanceof GoogleSetupError) return new PlatformWriteError(e.message, true);
  if (e instanceof TikTokError) return new PlatformWriteError(e.message, e.isAuthProblem);
  return new PlatformWriteError(e instanceof Error ? e.message : String(e));
}

/** Tạm dừng một chiến dịch. */
export async function pauseCampaign(
  adAccountId: string,
  campaignExternalId: string,
): Promise<void> {
  const ctx = await ctxOf(adAccountId);
  try {
    if (ctx.platform === 'google') {
      const s = await googleSession(adAccountId);
      await gWrite.setCampaignStatus(s.auth, s.customerId, campaignExternalId, 'PAUSED');
      return;
    }
    const token = await readToken(adAccountId);
    if (!token) throw new PlatformWriteError('Không đọc được token', true);
    if (ctx.platform === 'tiktok') {
      await ttWrite.setCampaignStatus(token, ctx.externalId, campaignExternalId, 'DISABLE');
      return;
    }
    await fbWrite.setCampaignStatus(token, campaignExternalId, 'PAUSED');
  } catch (e) {
    throw wrap(e);
  }
}

/**
 * Đọc lại trạng thái chiến dịch. Trả về chuỗi gốc của nền tảng.
 *
 * Facebook dùng ACTIVE/PAUSED, Google dùng ENABLED/PAUSED. Nơi gọi so sánh với
 * 'PAUSED' là đủ vì cả hai trùng nhau ở giá trị này.
 */
export async function readCampaignStatus(
  adAccountId: string,
  campaignExternalId: string,
): Promise<string | null> {
  const ctx = await ctxOf(adAccountId);
  try {
    if (ctx.platform === 'google') {
      const s = await googleSession(adAccountId);
      return await gWrite.readCampaignStatus(s.auth, s.customerId, campaignExternalId);
    }
    const token = await readToken(adAccountId);
    if (!token) return null;
    if (ctx.platform === 'tiktok') {
      // ENABLE/DISABLE → ACTIVE/PAUSED: nơi gọi so sánh với 'PAUSED'.
      const c = await ttWrite.getCampaign(token, ctx.externalId, campaignExternalId);
      return c ? (c.operationStatus === 'ENABLE' ? 'ACTIVE' : 'PAUSED') : null;
    }
    return await fbWrite.readCampaignStatus(token, campaignExternalId);
  } catch {
    return null;
  }
}

/**
 * Đổi ngân sách/ngày.
 *
 * Với Google, hàm bên dưới TỪ CHỐI nếu ngân sách đang dùng chung cho nhiều
 * chiến dịch — lỗi đó nổi lên đây và nơi gọi phải ghi vào nhật ký.
 */
export async function setDailyBudget(
  adAccountId: string,
  campaignExternalId: string,
  budgetMicros: number,
): Promise<void> {
  const ctx = await ctxOf(adAccountId);
  try {
    if (ctx.platform === 'google') {
      const s = await googleSession(adAccountId);
      // Google nhận thẳng micros — KHÔNG quy đổi theo tiền tệ.
      await gWrite.setCampaignDailyBudget(s.auth, s.customerId, campaignExternalId, budgetMicros);
      return;
    }
    const token = await readToken(adAccountId);
    if (!token) throw new PlatformWriteError('Không đọc được token', true);
    if (ctx.platform === 'tiktok') {
      // TikTok nhận đơn vị tiền tệ CÓ phần lẻ; hàm bên dưới từ chối chiến dịch
      // không đặt ngân sách theo ngày ở cấp chiến dịch.
      await ttWrite.setCampaignDailyBudget(token, ctx.externalId, campaignExternalId, budgetMicros, ctx.currency);
      return;
    }
    // Facebook nhận đơn vị nhỏ nhất của tiền tệ, nên phải truyền currency.
    await fbWrite.setCampaignDailyBudget(token, campaignExternalId, budgetMicros, ctx.currency);
  } catch (e) {
    throw wrap(e);
  }
}

/** Đọc lại ngân sách, trả micros. null nếu không đọc được. */
export async function readDailyBudget(
  adAccountId: string,
  campaignExternalId: string,
): Promise<number | null> {
  const ctx = await ctxOf(adAccountId);
  try {
    if (ctx.platform === 'google') {
      const s = await googleSession(adAccountId);
      return await gWrite.readCampaignBudget(s.auth, s.customerId, campaignExternalId);
    }
    const token = await readToken(adAccountId);
    if (!token) return null;
    if (ctx.platform === 'tiktok') {
      const c = await ttWrite.getCampaign(token, ctx.externalId, campaignExternalId);
      return c?.budgetMicros ?? null;
    }
    return await fbWrite.readCampaignBudget(token, campaignExternalId, ctx.currency);
  } catch {
    return null;
  }
}
