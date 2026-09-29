// Đánh giá chiến dịch theo ngưỡng CPA, ghi nhật ký, và tắt thật nếu được phép.
//
// Ở chế độ 'dry_run' (mặc định) chỉ ghi đề xuất, không chạm vào Facebook.
// Chỉ khi cấu hình đặt mode='live' mới gọi lệnh ghi — và vẫn phải qua đủ bốn
// guard trước đó. Quyền ads_management là điều kiện CẦN, không phải điều kiện ĐỦ.

import { db } from '../db';
import { todayVn } from '../account';
import { readToken } from '../ads/token';
import { setCampaignStatus, readCampaignStatus, FacebookWriteError } from '../ads/facebook-write';
import { listCampaigns, type CampaignRow } from '../queries/ads';
import { getPauseConfig } from '../queries/configs';

export interface PauseRunResult {
  evaluated: number;
  proposed: number;
  /** Đã tắt THẬT trên Facebook. */
  applied: number;
  failed: number;
  blocked: number;
  skipped: number;
  notes: string[];
}

/** Vì sao một đề xuất bị chặn. Ghi vào ad_mutation.blocked_by. */
const BLOCKED = {
  protected: 'protected_campaign',
  blastRadius: 'blast_radius',
  notMeasurable: 'not_measurable',
} as const;

export async function runAutoPause(adAccountId: string): Promise<PauseRunResult> {
  const out: PauseRunResult = {
    evaluated: 0, proposed: 0, applied: 0, failed: 0, blocked: 0, skipped: 0, notes: [],
  };

  const cfg = await getPauseConfig(adAccountId);
  if (!cfg) {
    out.notes.push('Không có cấu hình tắt ads nào đang bật');
    return out;
  }

  const today = todayVn();
  // Chỉ đọc token khi thật sự cần ghi — chế độ chạy thử không cần chạm tới nó.
  const token = cfg.params.mode === 'live' ? await readToken(adAccountId) : null;
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
    //
    // GHI NHẬT KÝ TRƯỚC, GỌI API SAU. Nếu làm ngược lại mà tiến trình chết giữa
    // chừng thì có một chiến dịch bị tắt mà không bản ghi nào truy được.
    const mutationId = await record(adAccountId, c, today, {
      status: 'proposed',
      mode: cfg.params.mode,
      blockedBy: null,
      reason: a.reason,
    });

    if (!mutationId) { out.skipped++; continue; }
    pausesThisRun++;

    if (cfg.params.mode === 'dry_run') { out.proposed++; continue; }

    // ── Ghi thật ──
    if (!token) {
      await fail(mutationId, 'Không đọc được token của tài khoản');
      out.failed++;
      continue;
    }

    try {
      await setCampaignStatus(token, c.externalId, 'PAUSED');

      // Không tin response — đọc lại trạng thái từ Facebook để xác nhận.
      const after = await readCampaignStatus(token, c.externalId);
      if (after && after.toUpperCase() !== 'PAUSED') {
        await fail(mutationId, `Đã gọi lệnh tắt nhưng Facebook vẫn báo trạng thái "${after}"`);
        out.failed++;
        continue;
      }

      await db.query(
        `UPDATE ad_mutation SET status = 'applied', applied_at = NOW(),
                                after_value = $2
         WHERE id = $1`,
        [mutationId, after ?? 'PAUSED'],
      );
      out.applied++;
    } catch (e) {
      const msg = e instanceof FacebookWriteError
        ? `${e.message}${e.isPermission ? ' (thiếu quyền hoặc token hỏng — cần kết nối lại)' : ''}`
        : e instanceof Error ? e.message : String(e);
      await fail(mutationId, msg);
      out.failed++;
    }
  }

  return out;
}

async function fail(mutationId: string, message: string): Promise<void> {
  await db.query(
    `UPDATE ad_mutation SET status = 'failed', error_message = $2 WHERE id = $1`,
    [mutationId, message],
  );
}

/**
 * Ghi một dòng nhật ký. Trả null nếu đã có bản ghi cho cùng chiến dịch trong
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
): Promise<string | null> {
  const key = `${c.externalId}:pause:${today}`;
  const { rows } = await db.query(
    `INSERT INTO ad_mutation
       (ad_account_id, campaign_id, target_external_id, target_name, operation,
        mode, status, before_value, after_value, reason, blocked_by,
        cpa_raw_micros, cpa_settled_micros, target_cpa_micros, idempotency_key)
     VALUES ($1,$2,$3,$4,'pause',$5::ad_mutation_mode_t,$6::ad_mutation_status_t,
             'ACTIVE','PAUSED',$7,$8,$9,$10,$11,$12)
     ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      adAccountId, c.id, c.externalId, c.name, o.mode, o.status, o.reason, o.blockedBy,
      Math.round(c.assessment.cpaRawMicros),
      c.assessment.hasSettledData ? Math.round(c.assessment.cpaSettledMicros) : null,
      c.targetCpaMicros || null,
      key,
    ],
  );
  return rows[0]?.id ?? null;
}
