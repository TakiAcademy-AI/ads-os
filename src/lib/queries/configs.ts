import { db } from '../db';
import { safeParams, type AutomationKind, type AutoPauseConfig } from '../configs/schema';

export interface AutomationConfigRow {
  id: string;
  adAccountId: string;
  accountName: string;
  kind: AutomationKind;
  name: string;
  status: 'draft' | 'active' | 'paused';
  intervalMinutes: number;
  params: unknown;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export async function listConfigs(ownerId: string): Promise<AutomationConfigRow[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.ad_account_id, a.name AS account_name, c.kind, c.name, c.status,
            c.interval_minutes, c.params, c.last_run_at, c.last_error, c.created_at
     FROM automation_config c
     JOIN ad_account a ON a.id = c.ad_account_id
     WHERE c.owner_id = $1
     ORDER BY c.created_at DESC`,
    [ownerId],
  );
  return rows.map((r) => ({
    id: r.id,
    adAccountId: r.ad_account_id,
    accountName: r.account_name,
    kind: r.kind,
    name: r.name,
    status: r.status,
    intervalMinutes: r.interval_minutes,
    params: r.params,
    lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
    lastError: r.last_error,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function countByKind(ownerId: string): Promise<Record<AutomationKind, number>> {
  const { rows } = await db.query(
    `SELECT kind, COUNT(*)::int n FROM automation_config
     WHERE owner_id = $1 GROUP BY kind`,
    [ownerId],
  );
  const out = {
    metric_sync: 0, auto_pause: 0, budget_schedule: 0, post_trigger: 0,
  } as Record<AutomationKind, number>;
  for (const r of rows) out[r.kind as AutomationKind] = r.n;
  return out;
}

/**
 * Cấu hình auto_pause đang hiệu lực của một tài khoản.
 *
 * Lấy cả bản 'paused' để giao diện còn hiện ngưỡng đang đặt — nhưng chỉ bản
 * 'active' mới được phép tác động lên tài khoản. Nơi gọi phải tự kiểm `status`.
 */
export async function getPauseConfig(
  adAccountId: string,
): Promise<{ id: string; status: string; params: AutoPauseConfig } | null> {
  const { rows } = await db.query(
    `SELECT id, status, params FROM automation_config
     WHERE ad_account_id = $1 AND kind = 'auto_pause'
     ORDER BY (status = 'active') DESC, updated_at DESC
     LIMIT 1`,
    [adAccountId],
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, status: r.status, params: safeParams('auto_pause', r.params) };
}

export async function createConfig(input: {
  ownerId: string;
  adAccountId: string;
  kind: AutomationKind;
  name: string;
  intervalMinutes: number;
  params: unknown;
}): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO automation_config
       (owner_id, ad_account_id, kind, name, interval_minutes, params, status)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'draft')
     RETURNING id`,
    [input.ownerId, input.adAccountId, input.kind, input.name,
     input.intervalMinutes, JSON.stringify(input.params)],
  );
  return rows[0]!.id as string;
}

/** Đổi trạng thái. Trả false nếu cấu hình không thuộc về người gọi. */
export async function setConfigStatus(
  ownerId: string,
  configId: string,
  status: 'active' | 'paused',
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE automation_config SET status = $3, updated_at = NOW()
     WHERE id = $2 AND owner_id = $1`,
    [ownerId, configId, status],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteConfig(ownerId: string, configId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM automation_config WHERE id = $2 AND owner_id = $1`,
    [ownerId, configId],
  );
  return (rowCount ?? 0) > 0;
}
