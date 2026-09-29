import { headers } from 'next/headers';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { KeyManager, type KeyRow } from './key-manager';
import { McpExamples } from './examples';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'tag-ok', label: 'Đang hoạt động' },
  paused: { cls: 'tag-hold', label: 'Tạm tắt' },
  revoked: { cls: 'tag-over', label: 'Đã thu hồi' },
};

export default async function McpPage() {
  const user = await requireUser();

  // Địa chỉ thật của máy chủ, không kê cứng localhost: người dùng trên
  // testads.taki.vn chép nguyên lệnh mẫu sẽ không chạy được, và thông báo lỗi
  // chẳng gợi ý gì về nguyên nhân.
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const { rows: keys } = await db.query(
    `SELECT id, name, key_suffix, scopes, status, last_used_at, created_at
     FROM api_key WHERE owner_id = $1 ORDER BY created_at DESC`,
    [user.id],
  );

  // JOIN kèm owner_id, KHÔNG phải LEFT JOIN không điều kiện: bản cũ hiện nhật ký
  // gọi API của MỌI người dùng trên hệ thống, kèm cả tên key của họ.
  const { rows: logs } = await db.query(
    `SELECT l.tool, l.ok, l.duration_ms, l.created_at, k.name AS key_name
     FROM mcp_request_log l
     JOIN api_key k ON k.id = l.api_key_id
     WHERE k.owner_id = $1
     ORDER BY l.created_at DESC LIMIT 20`,
    [user.id],
  );

  const keyRows: KeyRow[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    keySuffix: k.key_suffix,
    scopes: k.scopes as string[],
    status: k.status,
    lastUsedAt: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
    createdAt: new Date(k.created_at).toISOString(),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>MCP Server</h1>
          <p>Điều khiển Ads OS bằng ngôn ngữ tự nhiên từ Claude Code, Claude Desktop hoặc Cursor</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <b>Kết nối</b>
          <span>4 công cụ, tất cả chỉ đọc</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Tạo key ở dưới rồi chép lệnh vào terminal. Sau đó hỏi Claude bằng
            tiếng Việt — &ldquo;chiến dịch nào đang vượt ngưỡng CPA&rdquo;,
            &ldquo;bot đã chặn những gì tuần này&rdquo; — nó sẽ tự gọi Ads OS.
          </div>
        </div>
      </div>

      <McpExamples />

      <KeyManager keys={keyRows} mcpUrl={`${origin}/api/mcp`} />

      <div className="card">
        <div className="card-head">
          <b>Tool khả dụng</b>
          <span>chưa có công cụ ghi — chưa lệnh nào tác động lên tài khoản quảng cáo</span>
        </div>
        <table>
          <tbody>
            {[
              ['ads_list_campaigns', 'Chiến dịch kèm CPA thô, CPA đã chín và đánh giá'],
              ['ads_get_kpis', 'Chi tiêu, kết quả, CPA, số lần bot tác động / bị chặn'],
              ['ads_list_mutations', 'Nhật ký thay đổi, gồm cả lần bị chốt an toàn chặn'],
              ['ads_attribution_curve', 'Cửa sổ attribution đo được từ lịch sử số liệu'],
            ].map(([name, desc]) => (
              <tr key={name}>
                <td className="mono" style={{ width: 210 }}>{name}</td>
                <td style={{ color: 'var(--ink-2)' }}>{desc}</td>
                <td className="n"><span className="tag tag-mute">đọc</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><b>Request gần đây</b><span>20 dòng mới nhất</span></div>
          <table>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--dim)', whiteSpace: 'nowrap', width: 130 }}>
                    {dateTime(new Date(l.created_at).toISOString())}
                  </td>
                  <td className="mono">{l.tool}</td>
                  <td style={{ color: 'var(--dim)' }}>{l.key_name ?? '—'}</td>
                  <td className="n mono" style={{ color: 'var(--dim)' }}>{l.duration_ms ?? '—'}ms</td>
                  <td className="n">
                    <span className={`tag ${l.ok ? 'tag-ok' : 'tag-over'}`}>{l.ok ? 'OK' : 'Lỗi'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
