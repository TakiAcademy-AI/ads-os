// Chi tiết + chỉnh sửa chiến dịch, cho cả Facebook và Google.
//
// Mọi thay đổi ở đây là THAO TÁC TAY của người dùng — không qua guard tự động
// hoá (ngưỡng CPA, danh sách bảo vệ). Nhưng vẫn phải: kiểm quyền sở hữu, ghi
// nhật ký (kể cả lần lỗi), và cập nhật bản sao trong ad_campaign để danh sách
// chiến dịch không hiện số cũ cho tới lượt đồng bộ sau.

import { db } from '../db';
import { readToken } from './token';
import { googleSession } from './google-session';
import { googleCampaignDetail } from './google-detail';
import { facebookCampaignDetail } from './facebook-detail';
import { tiktokCampaignDetail } from './tiktok-detail';
import * as ttWrite from './tiktok-write';
import { getTikTokAuth } from './tiktok-token';
import * as gWrite from './google-write';
import * as fbWrite from './facebook-write';
import type { CampaignDetail } from './campaign-detail-types';

export interface CampaignRef {
  id: string;
  adAccountId: string;
  platform: 'facebook' | 'google' | 'tiktok';
  externalId: string;
  name: string;
  currency: string;
  accountExternalId: string;
}

/** Tra chiến dịch theo ID nội bộ, CHỈ khi thuộc người gọi. */
export async function campaignRef(id: string, ownerId: string): Promise<CampaignRef | null> {
  const { rows } = await db.query(
    `SELECT c.id, c.ad_account_id, c.external_id, c.name, a.platform, a.currency,
            a.external_id AS account_external_id
     FROM ad_campaign c JOIN ad_account a ON a.id = c.ad_account_id
     WHERE c.id = $1 AND a.owner_id = $2`,
    [id, ownerId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, adAccountId: r.ad_account_id, platform: r.platform, externalId: r.external_id,
    name: r.name, currency: r.currency, accountExternalId: r.account_external_id,
  };
}

export async function loadCampaignDetail(ref: CampaignRef): Promise<CampaignDetail> {
  if (ref.platform === 'google') {
    const s = await googleSession(ref.adAccountId);
    return googleCampaignDetail(s.auth, s.customerId, ref.externalId, ref.currency);
  }
  if (ref.platform === 'facebook') {
    const token = await readToken(ref.adAccountId);
    if (!token) throw new Error('Không đọc được token Facebook — kết nối lại tài khoản');
    return facebookCampaignDetail(token, ref.accountExternalId, ref.externalId, ref.currency);
  }
  if (ref.platform === 'tiktok') {
    return tiktokCampaignDetail(await getTikTokAuth(ref.adAccountId), ref.accountExternalId, ref.externalId, ref.currency);
  }
  throw new Error('Nền tảng này chưa hỗ trợ xem chi tiết');
}

export type EditAction =
  | { action: 'rename'; name: string }
  | { action: 'status'; enabled: boolean }
  | { action: 'budget'; dailyBudget: number }
  | { action: 'group_status'; groupId: string; groupKind: 'adset' | 'ad_group' | 'asset_group'; groupName: string; enabled: boolean }
  | { action: 'group_budget'; groupId: string; groupName: string; dailyBudget: number }
  | { action: 'ad_status'; adId: string; groupId: string; adName: string; enabled: boolean }
  | { action: 'location_add'; geoIds: string[]; names: string[] }
  | { action: 'location_remove'; criterionId: string; name: string }
  | { action: 'keyword_add'; groupId: string; keywords: { text: string; matchType: 'BROAD' | 'PHRASE' | 'EXACT' }[] }
  | { action: 'keyword_status'; groupId: string; criterionId: string; text: string; enabled: boolean }
  | { action: 'keyword_remove'; groupId: string; criterionId: string; text: string };

type MutationOp = 'pause' | 'resume' | 'budget_change' | 'rename' | 'targeting_change' | 'keyword_change';

/** Mô tả thay đổi cho nhật ký: loại, đối tượng, giá trị trước/sau. */
function describe(a: EditAction, ref: CampaignRef, d: CampaignDetail): { op: MutationOp; target: string; targetName: string; before: string; after: string } {
  const money = (v: number) => `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${ref.currency === 'VND' ? 'đ' : ` ${ref.currency}`}/ngày`;
  const was = (micros: number | null | undefined) => (micros ? money(micros / 1_000_000) : '');
  switch (a.action) {
    case 'rename': return { op: 'rename', target: ref.externalId, targetName: ref.name, before: ref.name, after: a.name };
    case 'status': return { op: a.enabled ? 'resume' : 'pause', target: ref.externalId, targetName: ref.name, before: a.enabled ? 'tạm dừng' : 'đang bật', after: a.enabled ? 'đang bật' : 'tạm dừng' };
    case 'budget': return { op: 'budget_change', target: ref.externalId, targetName: ref.name, before: was(d.campaign.dailyBudgetMicros), after: money(a.dailyBudget) };
    case 'group_status': return { op: a.enabled ? 'resume' : 'pause', target: a.groupId, targetName: `${ref.name} › ${a.groupName}`, before: a.enabled ? 'tạm dừng' : 'đang bật', after: a.enabled ? 'đang bật' : 'tạm dừng' };
    case 'group_budget': return { op: 'budget_change', target: a.groupId, targetName: `${ref.name} › ${a.groupName}`, before: was(d.groups.find((g) => g.id === a.groupId)?.dailyBudgetMicros), after: money(a.dailyBudget) };
    case 'ad_status': return { op: a.enabled ? 'resume' : 'pause', target: a.adId, targetName: `${ref.name} › ${a.adName}`, before: a.enabled ? 'tạm dừng' : 'đang bật', after: a.enabled ? 'đang bật' : 'tạm dừng' };
    case 'location_add': return { op: 'targeting_change', target: ref.externalId, targetName: ref.name, before: '', after: `thêm vị trí: ${a.names.join(', ')}` };
    case 'location_remove': return { op: 'targeting_change', target: ref.externalId, targetName: ref.name, before: a.name, after: `bỏ vị trí: ${a.name}` };
    case 'keyword_add': return { op: 'keyword_change', target: a.groupId, targetName: ref.name, before: '', after: `thêm từ khoá: ${a.keywords.map((k) => k.text).join(', ')}` };
    case 'keyword_status': return { op: 'keyword_change', target: a.criterionId, targetName: `${ref.name} › ${a.text}`, before: '', after: a.enabled ? 'bật từ khoá' : 'tạm dừng từ khoá' };
    case 'keyword_remove': return { op: 'keyword_change', target: a.criterionId, targetName: `${ref.name} › ${a.text}`, before: a.text, after: `xoá từ khoá: ${a.text}` };
  }
}

/**
 * Mọi ID con (nhóm, quảng cáo, từ khoá, vị trí) phải thuộc ĐÚNG chiến dịch trên
 * URL. Route chỉ kiểm chiến dịch thuộc người gọi — không có bước này thì gửi
 * groupId của chiến dịch khác (cùng tài khoản Google, hoặc bất kỳ đâu token
 * Facebook với tới) là sửa được nó, mà nhật ký lại ghi dưới chiến dịch này.
 */
function assertBelongs(a: EditAction, d: CampaignDetail): void {
  const group = (id: string) => d.groups.some((g) => g.id === id);
  const bad = (what: string) => { throw new Error(`${what} không thuộc chiến dịch này`); };
  switch (a.action) {
    case 'group_status': case 'group_budget': case 'keyword_add':
      if (!group(a.groupId)) bad('Nhóm quảng cáo');
      break;
    case 'ad_status':
      if (!d.ads.some((x) => x.id === a.adId && x.groupId === a.groupId)) bad('Quảng cáo');
      break;
    case 'keyword_status': case 'keyword_remove':
      if (!d.keywords.some((k) => k.criterionId === a.criterionId && k.groupId === a.groupId)) bad('Từ khoá');
      break;
    case 'location_remove':
      if (!d.locations.some((l) => l.criterionId === a.criterionId && l.level === 'campaign')) bad('Vị trí');
      break;
    default:
      break;
  }
}

/** Chặn theo khả năng nền tảng/loại chiến dịch — giao diện đã ẩn, server vẫn phải chặn. */
function assertAllowed(a: EditAction, d: CampaignDetail): void {
  const need: Record<EditAction['action'], keyof CampaignDetail['can']> = {
    rename: 'rename', status: 'status', budget: 'budget', group_status: 'groupStatus',
    group_budget: 'groupBudget', ad_status: 'adStatus', location_add: 'locations',
    location_remove: 'locations', keyword_add: 'keywords', keyword_status: 'keywords', keyword_remove: 'keywords',
  };
  if (!d.can[need[a.action]]) throw new Error('Chiến dịch này không hỗ trợ thao tác đó từ Ads OS');
}

async function apply(ref: CampaignRef, a: EditAction, detail: CampaignDetail): Promise<void> {
  if (ref.platform === 'google') {
    const s = await googleSession(ref.adAccountId);
    const [auth, cus] = [s.auth, s.customerId];
    const st = (on: boolean) => (on ? 'ENABLED' : 'PAUSED') as gWrite.CampaignStatus;
    switch (a.action) {
      case 'rename': return gWrite.renameCampaign(auth, cus, ref.externalId, a.name);
      case 'status': return gWrite.setCampaignStatus(auth, cus, ref.externalId, st(a.enabled));
      // Hàm này tự từ chối nếu ngân sách đang dùng chung nhiều chiến dịch.
      case 'budget': return gWrite.setCampaignDailyBudget(auth, cus, ref.externalId, Math.round(a.dailyBudget * 1_000_000));
      case 'group_status':
        return a.groupKind === 'asset_group'
          ? gWrite.setAssetGroupStatus(auth, cus, a.groupId, st(a.enabled))
          : gWrite.setAdGroupStatus(auth, cus, a.groupId, st(a.enabled));
      case 'ad_status': return gWrite.setAdStatus(auth, cus, a.groupId, a.adId, st(a.enabled));
      case 'location_add': return gWrite.addCampaignLocations(auth, cus, ref.externalId, a.geoIds);
      case 'location_remove': return gWrite.removeCampaignCriterion(auth, cus, ref.externalId, a.criterionId);
      case 'keyword_add': return gWrite.addKeywords(auth, cus, a.groupId, a.keywords);
      case 'keyword_status': return gWrite.setKeywordStatus(auth, cus, a.groupId, a.criterionId, st(a.enabled));
      case 'keyword_remove': return gWrite.removeKeyword(auth, cus, a.groupId, a.criterionId);
      case 'group_budget': throw new Error('Google đặt ngân sách ở cấp chiến dịch, không ở nhóm quảng cáo');
    }
  }
  if (ref.platform === 'facebook') {
    const token = await readToken(ref.adAccountId);
    if (!token) throw new Error('Không đọc được token Facebook — kết nối lại tài khoản');
    const st = (on: boolean) => (on ? 'ACTIVE' : 'PAUSED') as fbWrite.CampaignStatus;
    switch (a.action) {
      case 'rename': return fbWrite.renameObject(token, ref.externalId, a.name);
      case 'status': return fbWrite.setCampaignStatus(token, ref.externalId, st(a.enabled));
      case 'budget': return fbWrite.setCampaignDailyBudget(token, ref.externalId, Math.round(a.dailyBudget * 1_000_000), ref.currency);
      case 'group_status': return fbWrite.setObjectStatus(token, a.groupId, st(a.enabled));
      case 'group_budget': return fbWrite.setAdSetDailyBudget(token, a.groupId, Math.round(a.dailyBudget * 1_000_000), ref.currency);
      case 'ad_status': return fbWrite.setObjectStatus(token, a.adId, st(a.enabled));
      default: throw new Error('Facebook chưa hỗ trợ thao tác này từ Ads OS');
    }
  }
  if (ref.platform === 'tiktok') {
    const token = await getTikTokAuth(ref.adAccountId);
    const adv = ref.accountExternalId;
    const st = (on: boolean) => (on ? 'ENABLE' : 'DISABLE') as ttWrite.TtStatus;
    const micros = (v: number) => Math.round(v * 1_000_000);
    // Upgraded Smart+ có bộ lệnh /smart_plus/… riêng — lệnh thường bị từ chối.
    const spl = detail.campaign.smartPlus === true;
    switch (a.action) {
      case 'rename': return ttWrite.renameCampaign(token, adv, ref.externalId, a.name, spl);
      case 'status': return ttWrite.setCampaignStatus(token, adv, ref.externalId, st(a.enabled), spl);
      case 'budget': return ttWrite.setCampaignDailyBudget(token, adv, ref.externalId, micros(a.dailyBudget), ref.currency);
      case 'group_status': return ttWrite.setAdGroupStatus(token, adv, a.groupId, st(a.enabled), spl);
      // Nhóm thường: ngân sách ngày có hiệu lực từ 00:00 HÔM SAU; Smart+: ngay.
      case 'group_budget': return ttWrite.setAdGroupDailyBudget(token, adv, a.groupId, micros(a.dailyBudget), ref.currency, spl);
      case 'ad_status': return ttWrite.setAdStatus(token, adv, a.adId, st(a.enabled), spl);
      default: throw new Error('TikTok chưa hỗ trợ thao tác này từ Ads OS');
    }
  }
  throw new Error('Nền tảng này chưa hỗ trợ chỉnh sửa');
}

/** Áp dụng một chỉnh sửa, ghi nhật ký cả khi thành công lẫn thất bại. */
export async function editCampaign(ref: CampaignRef, a: EditAction): Promise<void> {
  // Đọc lại từ nền tảng NGAY TRƯỚC khi sửa: để kiểm ID con thuộc chiến dịch, để
  // biết thao tác có được hỗ trợ không, và để nhật ký có giá trị TRƯỚC thật.
  const detail = await loadCampaignDetail(ref);
  assertAllowed(a, detail);
  assertBelongs(a, detail);

  const d = describe(a, ref, detail);
  const key = `edit:${a.action}:${d.target}:${Date.now()}`;
  try {
    await apply(ref, a, detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, campaign_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, error_message, idempotency_key, source)
       VALUES ($1,$2,$3,$4,$5,'live','failed',$6,$7,'Sửa tay từ trang chi tiết chiến dịch',$8,$9,'manual')
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
      [ref.adAccountId, ref.id, d.target, d.targetName, d.op, d.before, d.after, msg, key],
    ).catch(() => {});
    throw e;
  }

  // Thay đổi ĐÃ xảy ra trên nền tảng. Ghi nhật ký hay cập nhật bản sao mà lỗi
  // thì chỉ ghi lại lỗi — trả lỗi về lúc này là khiến người dùng bấm lại, và
  // đổi ngân sách / thêm từ khoá sẽ chạy hai lần trên nền tảng.
  try {
    await syncLocal(ref, a, d, key);
  } catch (e) {
    console.error('[campaign-edit] đã áp dụng nhưng không ghi được nhật ký:', e);
  }
}

async function syncLocal(
  ref: CampaignRef, a: EditAction, d: ReturnType<typeof describe>, key: string,
): Promise<void> {
  await db.query(
    `INSERT INTO ad_mutation
       (ad_account_id, campaign_id, target_external_id, target_name, operation, mode, status,
        before_value, after_value, reason, idempotency_key, source, applied_at)
     VALUES ($1,$2,$3,$4,$5,'live','applied',$6,$7,'Sửa tay từ trang chi tiết chiến dịch',$8,'manual',NOW())
     ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
    [ref.adAccountId, ref.id, d.target, d.targetName, d.op, d.before, d.after, key],
  );

  // Bản sao cục bộ: chỉ những gì danh sách chiến dịch hiện ra.
  if (a.action === 'rename') {
    await db.query(`UPDATE ad_campaign SET name = $2, updated_at = NOW() WHERE id = $1`, [ref.id, a.name]);
  } else if (a.action === 'status') {
    // Google lưu ENABLED; Facebook và TikTok (đã chuẩn hoá lúc đồng bộ) lưu ACTIVE.
    const v = a.enabled ? (ref.platform === 'google' ? 'ENABLED' : 'ACTIVE') : 'PAUSED';
    await db.query(`UPDATE ad_campaign SET status = $2, updated_at = NOW() WHERE id = $1`, [ref.id, v]);
  } else if (a.action === 'budget') {
    // Đặt luôn NGÂN SÁCH GỐC: lịch ngân sách giờ vàng tính phần trăm từ mốc này.
    // Giữ mốc cũ thì lượt cron kế tiếp đặt lại ngân sách theo mốc cũ — lần sửa
    // tay của người dùng biến mất trong vòng 5 phút mà không ai báo.
    const micros = Math.round(a.dailyBudget * 1_000_000);
    await db.query(
      `UPDATE ad_campaign SET daily_budget_micros = $2, base_daily_budget_micros = $2, updated_at = NOW()
       WHERE id = $1`,
      [ref.id, micros],
    );
  }
}
