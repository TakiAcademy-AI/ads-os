import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { withMcpAuth } from 'mcp-handler';
type AuthInfo = NonNullable<Awaited<ReturnType<Parameters<typeof withMcpAuth>[1]>>>;
import { db } from '../db';

const PREFIX = 'adsos_';

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Sinh key mới. Trả cả bản thô (hiện đúng một lần) và bản hash để lưu. */
export function generateKey(): { raw: string; hash: string; suffix: string } {
  const raw = PREFIX + randomBytes(24).toString('base64url');
  return { raw, hash: hashKey(raw), suffix: raw.slice(-4) };
}

export interface KeyContext {
  keyId: string;
  ownerId: string;
  name: string;
  scopes: string[];
}

/**
 * Xác thực Bearer token.
 *
 * Trả `undefined` = 401 (theo hợp đồng của withMcpAuth).
 *
 * Tra bằng key_hash: index UNIQUE nên là một lần tìm, không quét bảng. So sánh
 * lại bằng timingSafeEqual để không rò rỉ thông tin qua thời gian phản hồi —
 * dù với hash đã tra bằng index thì rủi ro rất nhỏ, vẫn làm cho đúng.
 */
export async function verifyToken(
  _req: Request,
  bearer?: string,
): Promise<AuthInfo | undefined> {
  if (!bearer || !bearer.startsWith(PREFIX)) return undefined;

  const hash = hashKey(bearer);
  const { rows } = await db.query(
    `SELECT id, owner_id, name, key_hash, scopes, status, expires_at
     FROM api_key WHERE key_hash = $1`,
    [hash],
  );
  const key = rows[0];
  if (!key) return undefined;

  const a = Buffer.from(key.key_hash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  if (key.status !== 'active') return undefined;
  if (key.expires_at && new Date(key.expires_at) < new Date()) return undefined;

  // Ghi nhận lần dùng cuối. Không await — chậm request MCP vì một lần UPDATE
  // là không đáng, và hỏng cái này cũng không được chặn request.
  db.query(`UPDATE api_key SET last_used_at = NOW() WHERE id = $1`, [key.id])
    .catch((e) => console.error('[mcp] không cập nhật được last_used_at:', e));

  return {
    token: bearer,
    clientId: key.name,
    scopes: key.scopes as string[],
    extra: { keyId: key.id, ownerId: key.owner_id } satisfies Record<string, unknown>,
  };
}

export async function logRequest(
  keyId: string | null,
  tool: string,
  ok: boolean,
  durationMs: number,
  error?: string,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO mcp_request_log (api_key_id, tool, ok, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [keyId, tool, ok, durationMs, error ?? null],
    );
  } catch (e) {
    console.error('[mcp] không ghi được log:', e);
  }
}
