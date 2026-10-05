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
  /**
   * false = tài khoản đã ngắt / mất token. Bộ chạy theo lịch BỎ QUA cấu hình
   * của tài khoản đó, nên cấu hình "đang bật" thật ra không chạy — phải nói ra.
   */
  accountUsable: boolean;
}

/** Cấu hình của một tài khoản. Bỏ trống accountId thì lấy của mọi tài khoản. */
export async function listConfigs(
  ownerId: string,
  accountId?: string | null,
): Promise<AutomationConfigRow[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.ad_account_id, a.name AS account_name, c.kind, c.name, c.status,
            c.interval_minutes, c.params, c.last_run_at, c.last_error, c.created_at,
            (a.status = 'active' AND a.encrypted_token IS NOT NULL) AS account_usable
     FROM automation_config c
     JOIN ad_account a ON a.id = c.ad_account_id
     WHERE c.owner_id = $1 AND ($2::uuid IS NULL OR c.ad_account_id = $2)
     ORDER BY c.created_at DESC`,
    [ownerId, accountId ?? null],
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
    accountUsable: r.account_usable === true,
  }));
}

export async function countByKind(
  ownerId: string,
  accountId?: string | null,
): Promise<Record<AutomationKind, number>> {
  const { rows } = await db.query(
    `SELECT kind, COUNT(*)::int n FROM automation_config
     WHERE owner_id = $1 AND ($2::uuid IS NULL OR ad_account_id = $2)
     GROUP BY kind`,
    [ownerId, accountId ?? null],
  );
  const out = {
    metric_sync: 0, auto_pause: 0, budget_schedule: 0, post_trigger: 0,
  } as Record<AutomationKind, number>;
  for (const r of rows) out[r.kind as AutomationKind] = r.n;
  return out;
}

/**
 * Cấu hình auto_pause ĐANG BẬT của một tài khoản.
 *
 * Chỉ lấy bản 'active'. Trước đây lấy cả 'paused'/'draft' rồi để nơi gọi tự
 * kiểm status — nhưng không nơi nào kiểm, nên một cấu hình đã tắt vẫn quyết
 * định ngưỡng CPA hiển thị ở trang Chiến dịch. Tắt mà vẫn có tác dụng là bẫy.
 */
export async function getPauseConfig(
  adAccountId: string,
): Promise<{ id: string; status: string; params: AutoPauseConfig } | null> {
  const { rows } = await db.query(
    `SELECT id, status, params FROM automation_config
     WHERE ad_account_id = $1 AND kind = 'auto_pause' AND status = 'active'
     ORDER BY updated_at DESC
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

/**
 * Sửa cấu hình đã tạo.
 *
 * KHÔNG cho đổi `kind` và `ad_account_id`: đổi loại thì params cũ vô nghĩa,
 * đổi tài khoản thì nhật ký và các bản ghi đã gắn với cấu hình này trỏ sai chỗ.
 * Muốn đổi hai thứ đó thì tạo cấu hình mới.
 */
export async function updateConfig(
  ownerId: string,
  configId: string,
  input: { name: string; intervalMinutes: number; params: unknown },
): Promise<{ kind: AutomationKind } | null> {
  const { rows } = await db.query(
    `UPDATE automation_config
     SET name = $3, interval_minutes = $4, params = $5::jsonb, updated_at = NOW()
     WHERE id = $2 AND owner_id = $1
     RETURNING kind`,
    [ownerId, configId, input.name, input.intervalMinutes, JSON.stringify(input.params)],
  );
  return rows[0] ? { kind: rows[0].kind as AutomationKind } : null;
}

/** Một cấu hình cụ thể, để dựng form sửa. */
export async function getConfig(
  ownerId: string,
  configId: string,
): Promise<{ kind: AutomationKind; params: unknown } | null> {
  const { rows } = await db.query(
    'SELECT kind, params FROM automation_config WHERE id = $2 AND owner_id = $1',
    [ownerId, configId],
  );
  return rows[0] ? { kind: rows[0].kind, params: rows[0].params } : null;
}

/**
 * Đổi chế độ chạy thử ⇄ ghi thật.
 *
 * mode nằm trong params (JSONB) nên sửa tại chỗ bằng jsonb_set. Chỉ ba loại có
 * chế độ; metric_sync chỉ đọc số nên không có khái niệm ghi thật.
 *
 * Trả về kind để nơi gọi biết loại nào, null nếu không thuộc người gọi hoặc
 * loại không hỗ trợ.
 */
export async function setConfigMode(
  ownerId: string,
  configId: string,
  mode: 'dry_run' | 'live',
): Promise<{ kind: AutomationKind } | null> {
  const { rows } = await db.query(
    `UPDATE automation_config
     SET params = jsonb_set(COALESCE(params,'{}'::jsonb), '{mode}', to_jsonb($3::text)),
         updated_at = NOW()
     WHERE id = $2 AND owner_id = $1
       AND kind IN ('auto_pause','budget_schedule','post_trigger')
     RETURNING kind`,
    [ownerId, configId, mode],
  );
  return rows[0] ? { kind: rows[0].kind as AutomationKind } : null;
}

export async function deleteConfig(ownerId: string, configId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM automation_config WHERE id = $2 AND owner_id = $1`,
    [ownerId, configId],
  );
  return (rowCount ?? 0) > 0;
}
