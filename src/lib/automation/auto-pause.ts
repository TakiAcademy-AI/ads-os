// Đánh giá chiến dịch theo ngưỡng CPA và ghi đề xuất vào ad_mutation.
//
// KHÔNG gọi API Facebook. Ở chế độ 'live' cũng chỉ ghi nhật ký rồi báo lỗi —
// muốn tắt thật phải có scope ads_management, và phải qua một lớp riêng có
// xác nhận. Lớp này chỉ QUYẾT ĐỊNH, không THỰC THI.

import { db } from '../db';
import { todayVn } from '../account';
import { listCampaigns, type CampaignRow } from '../queries/ads';
import { getPauseConfig } from '../queries/configs';

export interface PauseRunResult {
  evaluated: number;
  proposed: number;
  blocked: number;
  skipped: number;
  notes: string[];
}

/** Vì sao một đề xuất bị chặn. Ghi vào ad_mutation.blocked_by. */
const BLOCKED = {
  protected: 'protected_campaign',
  blastRadius: 'blast_radius',
  notMeasurable: 'not_measurable',
  liveNotAllowed: 'live_write_unavailable',
} as const;

export async function runAutoPause(adAccountId: string): Promise<PauseRunResult> {
  const out: PauseRunResult = { evaluated: 0, proposed: 0, blocked: 0, skipped: 0, notes: [] };

  const cfg = await getPauseConfig(adAccountId);
  if (!cfg) {
    out.notes.push('Không có cấu hình tắt ads nào đang bật');
    return out;
  }

  const today = todayVn();
  const campaigns = await listCampaigns(adAccountId, 30, today);
  const protectedIds = new Set(cfg.params.protectedCampaignIds);

  // Chỉ xét chiến dịch đang chạy. Chiến dịch đã tắt thì đề xuất tắt là vô nghĩa.
  const running = campaigns.filter((c) => c.status.toUpperCase() === 'ACTIVE');
  out.evaluated = running.length;

  let pausesThisRun = 0;

  for (const c of running) {
    const a = c.assessment;

    // Chỉ hành động khi dữ liệu ĐÃ CHÍN nói rằng vượt ngưỡng. Các verdict khác
    // ('saved', 'holding', 'ok') không sinh đề xuất — nhưng 'saved' vẫn được
    // ghi nhật ký vì đó là lúc guard cứu một chiến dịch khỏi bị tắt oan.
    if (a.verdict === 'saved') {
      const wrote = await record(adAccountId, c, today, {
        status: 'blocked',
        mode: cfg.params.mode,
        blockedBy: 'attribution_window',
        reason: a.reason,
      });
      if (wrote) out.blocked++; else out.skipped++;
      continue;
    }

    if (a.verdict !== 'over') continue;

    // Không đo được chuyển đổi thì CPA vô nghĩa — tuyệt đối không tắt.
    if (!c.conversionAction) {
      const wrote = await record(adAccountId, c, today, {
        status: 'blocked',
        mode: cfg.params.mode,
        blockedBy: BLOCKED.notMeasurable,
        reason: `Không xác định được hành động nào để đếm chuyển đổi cho mục tiêu `
          + `"${c.objective}". CPA hiển thị không có cơ sở nên không tắt.`,
      });
      if (wrote) out.blocked++; else out.skipped++;
      continue;
    }

    if (protectedIds.has(c.id)) {
      const wrote = await record(adAccountId, c, today, {
        status: 'blocked',
        mode: cfg.params.mode,
        blockedBy: BLOCKED.protected,
        reason: `Vượt ngưỡng nhưng nằm trong danh sách bảo vệ — chỉ cảnh báo. ${a.reason}`,
      });
      if (wrote) out.blocked++; else out.skipped++;
      continue;
    }

    if (pausesThisRun >= cfg.params.maxPausesPerRun) {
      const wrote = await record(adAccountId, c, today, {
        status: 'blocked',
        mode: cfg.params.mode,
        blockedBy: BLOCKED.blastRadius,
        reason: `Đã chạm trần ${cfg.params.maxPausesPerRun} chiến dịch mỗi lượt. `
          + `Hoãn sang lượt sau. ${a.reason}`,
      });
      if (wrote) out.blocked++; else out.skipped++;
      continue;
    }

    // Tới đây là đủ điều kiện tắt.
    if (cfg.params.mode === 'live') {
      // Chưa có lớp ghi. Ghi lại rõ ràng thay vì im lặng bỏ qua — người bật
      // chế độ 'live' phải thấy được vì sao không có gì xảy ra.
      const wrote = await record(adAccountId, c, today, {
        status: 'blocked',
        mode: 'live',
        blockedBy: BLOCKED.liveNotAllowed,
        reason: `Đủ điều kiện tắt nhưng hệ thống chưa có quyền ghi lên Facebook `
          + `(cần scope ads_management). ${a.reason}`,
      });
      if (wrote) out.blocked++; else out.skipped++;
      continue;
    }

    const wrote = await record(adAccountId, c, today, {
      status: 'proposed',
      mode: 'dry_run',
      blockedBy: null,
      reason: a.reason,
    });
    if (wrote) { out.proposed++; pausesThisRun++; } else out.skipped++;
  }

  return out;
}

/**
 * Ghi một dòng nhật ký. Trả false nếu đã có bản ghi cho cùng chiến dịch trong
 * ngày — cron chạy 30 phút một lần, không chặn thì mỗi ngày ghi 48 dòng giống
 * hệt nhau và nhật ký thành vô dụng.
 */
async function record(
  adAccountId: string,
  c: CampaignRow,
  today: string,
  o: {
    status: 'proposed' | 'blocked';
    mode: 'dry_run' | 'live';
    blockedBy: string | null;
    reason: string;
  },
): Promise<boolean> {
  const key = `${c.externalId}:pause:${today}`;
  const { rowCount } = await db.query(
    `INSERT INTO ad_mutation
       (ad_account_id, campaign_id, target_external_id, target_name, operation,
        mode, status, before_value, after_value, reason, blocked_by,
        cpa_raw_micros, cpa_settled_micros, target_cpa_micros, idempotency_key)
     VALUES ($1,$2,$3,$4,'pause',$5::ad_mutation_mode_t,$6::ad_mutation_status_t,
             'ACTIVE','PAUSED',$7,$8,$9,$10,$11,$12)
     ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING`,
    [
      adAccountId, c.id, c.externalId, c.name, o.mode, o.status, o.reason, o.blockedBy,
      Math.round(c.assessment.cpaRawMicros),
      c.assessment.hasSettledData ? Math.round(c.assessment.cpaSettledMicros) : null,
      c.targetCpaMicros || null,
      key,
    ],
  );
  return (rowCount ?? 0) > 0;
}
