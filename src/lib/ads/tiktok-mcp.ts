// Kết nối TikTok qua TikTok for Business MCP Server — KHÔNG cần app nhà phát triển.
//
// https://business-api.tiktok.com/portal/docs/how-to-connect-a-custom-agent-to-tiktok-for-business-mcp-server/v1.3
//
// Ads OS đóng vai "custom agent": tự đăng ký client (Dynamic Client
// Registration, không có secret), xin quyền bằng OAuth + PKCE, rồi gọi các
// TOOL của MCP server — mỗi tool bọc đúng một endpoint Marketing API v1.3
// (campaign_get ↔ /campaign/get/…), cùng tham số, cùng phong bì {code, data}.
//
// Ba điều phải nhớ:
// 1. Token GẮN VỚI ĐƯỜNG DẪN server. Dùng tt-ads-mcp-flat (gọi thẳng mọi tool
//    theo tên); token của path này không dùng được cho path khác.
// 2. Access token sống 24 giờ — làm mới bằng refresh token. Refresh token sống
//    30 ngày và KHÔNG gia hạn khi làm mới: hết 30 ngày phải cấp quyền lại.
// 3. Mỗi tool giới hạn 3 lần/giây cho mỗi người dùng TikTok for Business.

import { createHash, randomBytes } from 'node:crypto';

export const MCP_SERVER = process.env.TIKTOK_MCP_SERVER || 'tt-ads-mcp-flat';
const BASE = 'https://business-api.tiktok.com';
export const MCP_RESOURCE = `${BASE}/open_mcp/${MCP_SERVER}`;
const OAUTH = `${MCP_RESOURCE}/oauth`;
const AUTHORIZE = `${BASE}/portal/mcp-tt4b-authorize`;
const TIMEOUT_MS = 60_000;

export interface McpTokens {
  access_token: string;
  refresh_token: string;
  /** epoch ms */
  expires_at: number;
  /** epoch ms — hết hạn QUYỀN, phải cấp quyền lại. */
  refresh_expires_at: number;
  /** Định danh một lần cấp quyền — các tài khoản cùng lần cấp dùng chung token. */
  grant_id: string;
  server: string;
}

export class McpAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'McpAuthError'; }
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

/** Đăng ký client. Rẻ và không cần bí mật — làm ở mỗi lần bắt đầu kết nối. */
export async function registerClient(redirectUri: string): Promise<string> {
  const res = await fetch(`${OAUTH}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Ads OS',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { client_id?: string; error_description?: string; error?: string };
  if (!j.client_id) throw new Error(`TikTok không cho đăng ký client: ${j.error_description ?? j.error ?? `HTTP ${res.status}`}`);
  return j.client_id;
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');   // 64 ký tự, trong khoảng 43–128
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function mcpAuthUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('resource', MCP_RESOURCE);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'mcp:tt4b');
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  // Tài liệu không nhắc state; gửi kèm theo chuẩn OAuth. Bảo vệ chính là PKCE:
  // mã cấp quyền của người khác không đổi được bằng verifier trong phiên này.
  u.searchParams.set('state', state);
  return u.toString();
}

interface TokenResponse {
  access_token?: string; refresh_token?: string; expires_in?: number;
  refresh_token_expires_in?: number; error?: string; error_description?: string;
}

async function tokenCall(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !j.access_token) {
    // error_description là nguồn sự thật theo tài liệu.
    throw new McpAuthError(j.error_description ?? j.error ?? `TikTok trả HTTP ${res.status}`);
  }
  return j;
}

function toTokens(j: TokenResponse, grantId: string, prevRefreshExpiry?: number): McpTokens {
  const now = Date.now();
  return {
    access_token: j.access_token!,
    refresh_token: j.refresh_token ?? '',
    // Trừ 5 phút để làm mới TRƯỚC khi hết hạn, không phải sau khi bị từ chối.
    expires_at: now + Math.max(60, (j.expires_in ?? 86_399) - 300) * 1000,
    refresh_expires_at: j.refresh_token_expires_in
      ? now + j.refresh_token_expires_in * 1000
      : prevRefreshExpiry ?? now + 30 * 86_400_000,
    grant_id: grantId,
    server: MCP_SERVER,
  };
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<McpTokens> {
  const j = await tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
  return toTokens(j, randomBytes(12).toString('hex'));
}

export async function refreshTokens(t: McpTokens): Promise<McpTokens> {
  if (!t.refresh_token || Date.now() >= t.refresh_expires_at) {
    throw new McpAuthError('Quyền TikTok (30 ngày) đã hết hạn — vào Kết nối → TikTok để cấp quyền lại.');
  }
  const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  return toTokens(j, t.grant_id, t.refresh_expires_at);
}

// ─── Gọi tool ────────────────────────────────────────────────────────────────

/** Endpoint v1.3 → tên tool. Phần lớn là thay / bằng _; vài tool có tên riêng. */
const TOOL_NAME: Record<string, string> = {
  'advertiser/info': 'advertiser_info_get',
  'ad/review_info': 'ad_review_info_get',
  'adgroup/review_info': 'adgroup_review_info_get',
  'oauth2/advertiser/get': 'auth_advertiser_get',
  'smart_plus/ad/review_info': 'smart_plus_ad_review_info_get',
};
export function toolNameFor(path: string): string {
  const p = path.replace(/^\/+|\/+$/g, '');
  return TOOL_NAME[p] ?? p.replace(/\//g, '_');
}

let rpcId = 0;

/**
 * Gọi một tool. Trả về PHONG BÌ gốc của Marketing API {code, message, data} —
 * tool trả nó dạng chuỗi JSON trong result.content[0].text. Nơi gọi (ttCall)
 * kiểm `code` y như khi gọi REST.
 */
export async function callTool(
  accessToken: string, name: string, args: Record<string, unknown>,
): Promise<{ code?: number; message?: string; data?: unknown }> {
  const res = await fetch(MCP_RESOURCE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Streamable HTTP: server được phép trả JSON hoặc SSE.
      Accept: 'application/json, text/event-stream',
      // Tài liệu dùng Authorization: Bearer ở chỗ này, Access-Token ở chỗ khác — gửi cả hai.
      Authorization: `Bearer ${accessToken}`,
      'Access-Token': accessToken,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new McpAuthError('Token TikTok MCP không hợp lệ hoặc đã hết hạn — kết nối lại.');
  }

  const raw = await res.text();
  // SSE: lấy khối "data:" cuối cùng có chứa phản hồi JSON-RPC.
  let body: string = raw;
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const datas = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    body = datas.reverse().find((d) => d.includes('"jsonrpc"')) ?? datas[0] ?? '';
  }
  let rpc: { error?: { message?: string; code?: number }; result?: { isError?: boolean; content?: { type?: string; text?: string }[]; structuredContent?: unknown } };
  try { rpc = JSON.parse(body); } catch {
    return { code: res.status || -1, message: `MCP trả dữ liệu không đọc được (HTTP ${res.status})` };
  }
  if (rpc.error) return { code: rpc.error.code ?? -1, message: `MCP: ${rpc.error.message ?? 'lỗi không rõ'}` };

  const text = rpc.result?.content?.find((c) => c.type === 'text')?.text ?? '';
  let env: { code?: number; message?: string; data?: unknown } | null = null;
  try { env = JSON.parse(text); } catch { /* không phải JSON */ }
  if (env && typeof env === 'object' && 'code' in env) return env;
  if (rpc.result?.structuredContent && typeof rpc.result.structuredContent === 'object') {
    return rpc.result.structuredContent as { code?: number; data?: unknown };
  }
  if (rpc.result?.isError) return { code: -1, message: text || 'Tool báo lỗi' };
  // Tool trả dữ liệu trơn (không bọc phong bì) — coi như thành công.
  return { code: 0, data: env ?? text };
}
