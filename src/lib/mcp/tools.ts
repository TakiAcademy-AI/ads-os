// MCP tool của Ads OS — CHỈ ĐỌC ở giai đoạn này.
//
// Dùng lại nguyên lớp query của web app, không có đường truy vấn riêng. Quan
// trọng: khi thêm tool GHI sau này, nó cũng phải đi qua guard attribution và
// ghi ad_mutation như cron — nếu không, LLM thành cửa hậu vòng qua toàn bộ
// cơ chế chống tắt oan.

import type { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { db } from '../db';
import { todayVn } from '../account';
import {
  getKpis,
  listCampaigns,
  listMutations,
  getAttributionCurve,
} from '../queries/ads';

const vnd = (micros: number) => `${Math.round(micros / 1_000_000).toLocaleString('vi-VN')}đ`;

const VERDICT_VI: Record<string, string> = {
  ok: 'trong ngưỡng',
  saved: 'GIỮ LẠI — CPA thô vượt nhưng dữ liệu đã chín thì không',
  holding: 'chưa đủ dữ liệu chín để kết luận',
  over: 'vượt ngưỡng — tắt được',
};

/** Tài khoản QC mặc định của chủ key. */
async function resolveAccount(ownerId: string, accountId?: string): Promise<string | null> {
  if (accountId) {
    const { rows } = await db.query(
      `SELECT id FROM ad_account WHERE id = $1 AND owner_id = $2`,
      [accountId, ownerId],
    );
    return rows[0]?.id ?? null;
  }
  const { rows } = await db.query(
    `SELECT id FROM ad_account WHERE owner_id = $1 AND status = 'active'
     ORDER BY created_at LIMIT 1`,
    [ownerId],
  );
  return rows[0]?.id ?? null;
}

const noAccount = {
  content: [{ type: 'text' as const, text: 'Chưa kết nối tài khoản quảng cáo nào.' }],
};

const DAYS = z.number().int().min(1).max(90).optional()
  .describe('Số ngày nhìn lại, 1-90. Mặc định 30.');
const ACCOUNT = z.string().uuid().optional()
  .describe('ID tài khoản QC. Bỏ trống thì lấy tài khoản active đầu tiên.');

// Kiểu server lấy từ chính mcp-handler — gói này đóng gói bản SDK riêng, nên
// import @modelcontextprotocol/sdk song song sẽ ra hai kiểu McpServer không khớp.
type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

/**
 * Chủ sở hữu của request HIỆN TẠI, lấy từ key đã xác thực.
 *
 * Phải đọc theo TỪNG lời gọi, không được nướng vào lúc đăng ký tool:
 * createMcpHandler chạy một lần lúc nạp module và dùng chung cho mọi request,
 * nên owner cố định sẽ làm key của người này đọc được dữ liệu của người kia.
 *
 * Nhận `unknown` thay vì kiểu ServerContext của SDK: hình dạng context đổi giữa
 * các phiên bản, còn thứ ta cần chỉ là một chuỗi nằm sâu bên trong — đọc phòng
 * thủ thì không vỡ khi SDK nâng cấp.
 */
function ownerOf(ctx: unknown): string | null {
  const obj = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

  const root = obj(ctx);
  if (!root) return null;

  // mcp-handler 2.x lồng dưới ctx.http.authInfo; bản cũ để thẳng ctx.authInfo.
  // Thử cả hai để nâng cấp SDK không làm rơi danh tính một cách im lặng.
  const auth = obj(obj(root.http)?.authInfo) ?? obj(root.authInfo);
  const owner = obj(auth?.extra)?.ownerId;
  return typeof owner === 'string' ? owner : null;
}

const noAuth = {
  content: [{ type: 'text' as const, text: 'Không xác định được chủ sở hữu của API key.' }],
};

export function registerTools(server: McpServer): void {
  // ─── ads_list_campaigns ────────────────────────────────────────────────
  server.registerTool(
    'ads_list_campaigns',
    {
      title: 'Danh sách chiến dịch kèm đánh giá CPA',
      description:
        'Liệt kê chiến dịch với CPA thô (toàn kỳ) và CPA đã chín (chỉ phần dữ liệu ' +
        'đã qua cửa sổ attribution), so với ngưỡng mục tiêu. Verdict "saved" nghĩa là ' +
        'CPA thô vượt ngưỡng nhưng CPA đã chín thì không — tắt theo CPA thô sẽ tắt oan. ' +
        'Dùng khi cần biết chiến dịch nào THẬT SỰ đang lỗ.',
      inputSchema: { days: DAYS, accountId: ACCOUNT },
    },
    async ({ days, accountId }, ctx: unknown) => {
      const ownerId = ownerOf(ctx);
      if (!ownerId) return noAuth;
      const acct = await resolveAccount(ownerId, accountId);
      if (!acct) return noAccount;

      const rows = await listCampaigns(acct, days ?? 30, todayVn());
      const lines = rows.map((c) => {
        const a = c.assessment;
        return `• ${c.name} [${c.status}] — chi ${vnd(c.spendMicros)}, ` +
          `CPA thô ${vnd(a.cpaRawMicros)}, ` +
          `CPA đã chín ${a.hasSettledData ? vnd(a.cpaSettledMicros) : 'chưa đủ dữ liệu'}, ` +
          `ngưỡng ${c.targetCpaMicros ? vnd(c.targetCpaMicros) : 'chưa đặt'} ` +
          `→ ${VERDICT_VI[a.verdict]}${c.isWhitelisted ? ' (whitelist)' : ''}`;
      });

      const saved = rows.filter((c) => c.assessment.verdict === 'saved');
      const summary = saved.length
        ? `\n\n${saved.length} chiến dịch sẽ bị tắt oan nếu chỉ nhìn CPA thô: ` +
          saved.map((c) => c.name).join(', ')
        : '';

      return {
        content: [{ type: 'text', text: (lines.join('\n') || 'Chưa có chiến dịch nào.') + summary }],
        structuredContent: {
          days: days ?? 30,
          campaigns: rows.map((c) => ({
            id: c.id,
            externalId: c.externalId,
            name: c.name,
            objective: c.objective,
            status: c.status,
            isWhitelisted: c.isWhitelisted,
            spendMicros: c.spendMicros,
            conversions: c.conversions,
            targetCpaMicros: c.targetCpaMicros,
            cpaRawMicros: Math.round(c.assessment.cpaRawMicros),
            cpaSettledMicros: Math.round(c.assessment.cpaSettledMicros),
            hasSettledData: c.assessment.hasSettledData,
            verdict: c.assessment.verdict,
            reason: c.assessment.reason,
          })),
        },
      };
    },
  );

  // ─── ads_get_kpis ──────────────────────────────────────────────────────
  server.registerTool(
    'ads_get_kpis',
    {
      title: 'Chỉ số tổng quan',
      description: 'Chi tiêu, kết quả, CPA trung bình, và số lần bot đã tác động / bị guard chặn.',
      inputSchema: { days: DAYS, accountId: ACCOUNT },
    },
    async ({ days, accountId }, ctx: unknown) => {
      const ownerId = ownerOf(ctx);
      if (!ownerId) return noAuth;
      const acct = await resolveAccount(ownerId, accountId);
      if (!acct) return noAccount;

      const k = await getKpis(acct, days ?? 30);
      return {
        content: [{
          type: 'text',
          text: `${days ?? 30} ngày: chi ${vnd(k.spendMicros)}, ` +
            `${k.conversions.toLocaleString('vi-VN')} kết quả, CPA ${vnd(k.cpaMicros)}. ` +
            `Bot đã tác động ${k.mutationsApplied} lần, bị guard chặn ${k.mutationsBlocked} lần.`,
        }],
        structuredContent: { days: days ?? 30, ...k },
      };
    },
  );

  // ─── ads_list_mutations ────────────────────────────────────────────────
  server.registerTool(
    'ads_list_mutations',
    {
      title: 'Nhật ký thay đổi',
      description:
        'Mọi thay đổi bot định làm hoặc đã làm lên tài khoản QC, gồm cả lần chạy thử ' +
        'và lần bị guard chặn. Dùng khi cần biết "bot đã làm gì" hoặc "tại sao chiến dịch này bị tắt".',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe('Số dòng, mặc định 50.'),
        accountId: ACCOUNT,
      },
    },
    async ({ limit, accountId }, ctx: unknown) => {
      const ownerId = ownerOf(ctx);
      if (!ownerId) return noAuth;
      const acct = await resolveAccount(ownerId, accountId);
      if (!acct) return noAccount;

      const rows = await listMutations(acct, limit ?? 50);
      const lines = rows.map((r) =>
        `• ${new Date(r.createdAt).toLocaleString('vi-VN')} — ${r.targetName}: ` +
        `${r.operation} ${r.beforeValue}→${r.afterValue} ` +
        `[${r.mode === 'live' ? 'THẬT' : 'chạy thử'}/${r.status}]` +
        `${r.blockedBy ? ` chặn bởi ${r.blockedBy}` : ''}\n  ${r.reason}`,
      );
      return {
        content: [{ type: 'text', text: lines.join('\n') || 'Chưa có thay đổi nào.' }],
        structuredContent: { mutations: rows },
      };
    },
  );

  // ─── ads_attribution_curve ─────────────────────────────────────────────
  server.registerTool(
    'ads_attribution_curve',
    {
      title: 'Cửa sổ attribution đo được',
      description:
        'Đo từ lịch sử số liệu thật: kéo số sau N ngày thì đã thấy bao nhiêu phần trăm ' +
        'chuyển đổi cuối cùng. Dùng để chọn attributionDays thay vì đoán.',
      inputSchema: { accountId: ACCOUNT },
    },
    async ({ accountId }, ctx: unknown) => {
      const ownerId = ownerOf(ctx);
      if (!ownerId) return noAuth;
      const acct = await resolveAccount(ownerId, accountId);
      if (!acct) return noAccount;

      const curve = await getAttributionCurve(acct);
      if (!curve.points.length) {
        return {
          content: [{
            type: 'text',
            text: 'Chưa đủ lịch sử số liệu để đo. Cần vài tuần đồng bộ.',
          }],
          structuredContent: { ...curve },
        };
      }
      const lines = curve.points.map(
        (p) => `  +${p.dayOffset} ngày: ${(p.reportedRatio * 100).toFixed(1)}% (${p.samples} mẫu)`,
      );
      return {
        content: [{
          type: 'text',
          text: `Tỉ lệ chuyển đổi đã về theo số ngày kể từ ngày dữ liệu:\n${lines.join('\n')}\n\n` +
            (curve.suggestedDays !== null
              ? `Đề xuất attributionDays = ${curve.suggestedDays} (ngưỡng 95%).`
              : 'Chưa đủ mẫu để đề xuất con số.'),
        }],
        structuredContent: { ...curve },
      };
    },
  );
}
