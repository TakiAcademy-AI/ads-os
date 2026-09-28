import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'tag-ok', label: 'Đang hoạt động' },
  paused: { cls: 'tag-hold', label: 'Tạm tắt' },
  revoked: { cls: 'tag-over', label: 'Đã thu hồi' },
};

export default async function McpPage() {
  const user = await requireUser();

  const { rows: keys } = await db.query(
    `SELECT id, name, key_suffix, scopes, status, last_used_at, created_at
     FROM api_key WHERE owner_id = $1 ORDER BY created_at DESC`,
    [user.id],
  );

  const { rows: logs } = await db.query(
    `SELECT l.tool, l.ok, l.duration_ms, l.created_at, k.name AS key_name
     FROM mcp_request_log l LEFT JOIN api_key k ON k.id = l.api_key_id
     ORDER BY l.created_at DESC LIMIT 20`,
  );

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
          <span>4 tool, tất cả chỉ đọc</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>
            Tạo key bằng lệnh dưới, rồi gắn vào Claude Code:
          </div>
          <pre className="mono" style={{
            background: '#f5f5fa', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
            padding: '12px 14px', fontSize: 12.5, overflowX: 'auto', margin: 0, lineHeight: 1.7,
          }}>
{`npx tsx scripts/mint-key.ts "Claude Code"

claude mcp add ads-os --transport http \\
  http://localhost:3100/api/mcp \\
  --header "Authorization: Bearer <key>"`}
          </pre>
          <div className="note" style={{ marginTop: 10, maxWidth: 'none' }}>
            Key chỉ hiện một lần lúc tạo — hệ thống chỉ lưu SHA-256. Mất thì thu hồi và tạo key mới.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <b>API key</b>
          <span>{keys.length} key</span>
        </div>
        {keys.length === 0 ? (
          <div className="empty">Chưa có key nào.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Key</th>
                <th>Quyền</th>
                <th>Dùng lần cuối</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const st = STATUS[k.status] ?? STATUS.active!;
                return (
                  <tr key={k.id}>
                    <td>
                      <div className="cell-title">{k.name}</div>
                      <div className="cell-sub">tạo {dateTime(new Date(k.created_at).toISOString())}</div>
                    </td>
                    <td className="mono" style={{ color: 'var(--dim)' }}>adsos_…{k.key_suffix}</td>
                    <td>
                      {(k.scopes as string[]).map((s) => (
                        <span key={s} className={`tag ${s === 'write' ? 'tag-over' : 'tag-mute'}`}
                              style={{ marginRight: 4 }}>
                          {s === 'write' ? 'ghi' : 'đọc'}
                        </span>
                      ))}
                    </td>
                    <td style={{ color: 'var(--dim)' }}>
                      {k.last_used_at ? dateTime(new Date(k.last_used_at).toISOString()) : 'chưa dùng'}
                    </td>
                    <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <b>Tool khả dụng</b>
          <span>chưa có tool ghi — chưa lệnh nào tác động lên tài khoản QC</span>
        </div>
        <table>
          <tbody>
            {[
              ['ads_list_campaigns', 'Chiến dịch kèm CPA thô, CPA đã chín và đánh giá'],
              ['ads_get_kpis', 'Chi tiêu, kết quả, CPA, số lần bot tác động / bị chặn'],
              ['ads_list_mutations', 'Nhật ký thay đổi, gồm cả lần bị guard chặn'],
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
