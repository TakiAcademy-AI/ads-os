// Bộ chạy cấu hình theo lịch.
//
// Được gọi từ /api/cron (systemd timer gõ vào). Không dùng node-cron trong
// tiến trình app: Next dev khởi động lại liên tục và production có thể chạy
// nhiều instance — timer ngoài tiến trình thì chỉ có một nguồn kích hoạt.

import { db } from '../db';
import { syncAccount } from '../ads/sync';
import { runAutoPause } from './auto-pause';
import { runBudgetSchedule } from './budget-schedule';
import { safeParams, type AutomationKind } from '../configs/schema';

export interface ConfigRunResult {
  configId: string;
  kind: AutomationKind;
  name: string;
  accountName: string;
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface CronResult {
  ran: number;
  results: ConfigRunResult[];
}

/** Cấu hình tới hạn: đang bật, và chưa chạy lần nào hoặc đã quá hạn. */
async function dueConfigs() {
  const { rows } = await db.query(
    `SELECT c.id, c.kind, c.name, c.params, c.interval_minutes,
            c.ad_account_id, a.name AS account_name
     FROM automation_config c
     JOIN ad_account a ON a.id = c.ad_account_id
     WHERE c.status = 'active'
       AND a.status = 'active'
       AND a.encrypted_token IS NOT NULL
       AND (c.next_run_at IS NULL OR c.next_run_at <= NOW())
     ORDER BY c.next_run_at NULLS FIRST
     LIMIT 20`,
  );
  return rows;
}

export async function runDueConfigs(): Promise<CronResult> {
  const configs = await dueConfigs();
  const results: ConfigRunResult[] = [];

  for (const c of configs) {
    const started = Date.now();
    let ok = false;
    let message = '';

    try {
      if (c.kind === 'metric_sync') {
        const p = safeParams('metric_sync', c.params);
        const r = await syncAccount(c.ad_account_id, {
          lookbackDays: p.lookbackDays,
          level: p.level,
          extraFields: p.extraFields,
        });
        ok = r.ok;
        message = r.ok
          ? `${r.campaigns} chiến dịch · ${r.metricRows} dòng số liệu · ${r.revisionRows} revision mới`
          : (r.error ?? 'Đồng bộ thất bại');
      } else if (c.kind === 'auto_pause') {
        const r = await runAutoPause(c.ad_account_id);
        ok = r.failed === 0;
        message = `xét ${r.evaluated} chiến dịch · ${r.applied} ĐÃ TẮT THẬT · `
          + `${r.proposed} đề xuất · ${r.failed} lỗi · ${r.blocked} bị guard chặn · `
          + `${r.skipped} đã ghi trước đó`
          + (r.notes.length ? ` · ${r.notes.join('; ')}` : '');
      } else if (c.kind === 'budget_schedule') {
        const p = c.params as { mode?: string };
        const r = await runBudgetSchedule(
          c.ad_account_id, c.params, p.mode === 'live' ? 'live' : 'dry_run',
        );
        ok = r.failed === 0;
        message = `xét ${r.evaluated} chiến dịch · ${r.changed} đổi ngân sách · `
          + `${r.failed} lỗi · ${r.unchanged} đã đúng mức · ${r.skipped} đã ghi trước đó`
          + (r.notes.length ? ` · ${r.notes.join('; ')}` : '');
      } else {
        // post_trigger chưa có lớp thực thi. Ghi rõ thay vì lặng lẽ đánh dấu đã
        // chạy — nếu không người dùng tưởng nó đang chạy.
        message = `Loại "${c.kind}" chưa được hỗ trợ thực thi`;
      }
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }

    const durationMs = Date.now() - started;

    // Dời lịch kể cả khi lỗi — không thì một cấu hình hỏng sẽ chiếm chỗ mỗi
    // lượt chạy và chặn hết cấu hình khác.
    await db.query(
      `UPDATE automation_config
       SET last_run_at = NOW(),
           next_run_at = NOW() + (interval_minutes || ' minutes')::interval,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [c.id, ok ? null : message],
    );

    await db.query(
      `INSERT INTO sync_log (ad_account_id, job, ok, rows_written, duration_ms, message)
       VALUES ($1, $2, $3, 0, $4, $5)`,
      [c.ad_account_id, c.kind, ok, durationMs, `[${c.name}] ${message}`],
    ).catch(() => {});

    results.push({
      configId: c.id, kind: c.kind, name: c.name, accountName: c.account_name,
      ok, message, durationMs,
    });
  }

  return { ran: results.length, results };
}
