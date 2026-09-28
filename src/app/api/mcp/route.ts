// MCP HTTP transport. Endpoint: POST /api/mcp
//
// Auth: Bearer <adsos_...> — key lưu trong bảng api_key, chỉ giữ SHA-256.
// Scope 'read' bắt buộc.
//
// Tool ghi chưa có. Khi thêm, phải yêu cầu scope 'write' RIÊNG và vẫn đi qua
// guard attribution + ghi ad_mutation như cron — nếu không, LLM thành cửa hậu
// vòng qua toàn bộ cơ chế chống tắt oan.

import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyToken } from '@/lib/mcp/auth';
import { registerTools } from '@/lib/mcp/tools';

// pg không chạy được trên Edge.
export const runtime = 'nodejs';
export const maxDuration = 60;

// Handler được tạo MỘT LẦN và dùng chung cho mọi request, nên không truyền
// ownerId vào đây — mỗi tool tự đọc từ authInfo của request hiện tại.
// v2.2.0: createMcpHandler(initializeServer, options?) — hai tham số.
const handler = createMcpHandler(
  (server) => registerTools(server),
  {},
);

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ['read'],
});

export { authed as GET, authed as POST, authed as DELETE };
