'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface KeyRow {
  id: string;
  name: string;
  keySuffix: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'tag-ok', label: 'Đang hoạt động' },
  paused: { cls: 'tag-hold', label: 'Tạm tắt' },
  revoked: { cls: 'tag-over', label: 'Đã thu hồi' },
};

function when(iso: string | null): string {
  if (!iso) return 'chưa dùng';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function KeyManager({ keys, mcpUrl }: { keys: KeyRow[]; mcpUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Key thô chỉ tồn tại trong state này, không bao giờ quay lại từ máy chủ.
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || 'Claude Code' }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setFresh(d.key);
      setName('');
      router.refresh();
    } else setError(d.error ?? 'Không tạo được key');
  }

  async function revoke(k: KeyRow) {
    const ok = window.confirm(
      `Thu hồi key "${k.name}"?\n\n`
      + `Mọi công cụ đang dùng key này sẽ mất kết nối ngay lập tức. `
      + `Không khôi phục được — phải tạo key mới.`,
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/keys/${k.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? 'Không thu hồi được');
  }

  const cmd = fresh
    ? `claude mcp add ads-os --transport http \\\n  ${mcpUrl} \\\n  --header "Authorization: Bearer ${fresh}"`
    : '';

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <b>API key</b>
        <span>{keys.filter((k) => k.status !== 'revoked').length} key còn hiệu lực</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

        {fresh ? (
          <div style={{
            background: 'var(--grn-soft)', border: '1px solid var(--grn)',
            borderRadius: 'var(--r-sm)', padding: '13px 15px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grn)', marginBottom: 8 }}>
              Key đã tạo — chép ngay, đóng đi là không xem lại được
            </div>
            <pre className="mono" style={{
              background: 'var(--card)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)', padding: '11px 13px', fontSize: 12,
              overflowX: 'auto', margin: '0 0 10px', lineHeight: 1.7, whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>{cmd}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ fontSize: 12.5 }}
                      onClick={() => {
                        void navigator.clipboard.writeText(cmd);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}>
                {copied ? 'Đã chép' : 'Chép lệnh'}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                      onClick={() => setFresh(null)}>
                Tôi đã lưu rồi
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên key — VD: Claude Code trên máy làm việc"
              style={{
                flex: 1, padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
                border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
                background: 'var(--card)', color: 'var(--ink)',
              }}
            />
            <button className="btn" onClick={create} disabled={busy} style={{ flex: 'none' }}>
              {busy ? 'Đang tạo…' : 'Tạo key mới'}
            </button>
          </div>
        )}

        <div className="note" style={{ maxWidth: 'none' }}>
          Hệ thống chỉ lưu bản băm SHA-256 của key, không lưu key gốc. Mất thì thu
          hồi rồi tạo key khác — không có cách nào xem lại.
        </div>
      </div>

      {keys.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Tên</th>
              <th>Key</th>
              <th>Quyền</th>
              <th>Dùng lần cuối</th>
              <th>Trạng thái</th>
              <th className="n">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const st = STATUS[k.status] ?? STATUS.active!;
              return (
                <tr key={k.id}>
                  <td>
                    <div className="cell-title">{k.name}</div>
                    <div className="cell-sub">tạo {when(k.createdAt)}</div>
                  </td>
                  <td className="mono" style={{ color: 'var(--dim)' }}>adsos_…{k.keySuffix}</td>
                  <td>
                    {k.scopes.map((s) => (
                      <span key={s} className={`tag ${s === 'write' ? 'tag-over' : 'tag-mute'}`}
                            style={{ marginRight: 4 }}>
                        {s === 'write' ? 'ghi' : 'đọc'}
                      </span>
                    ))}
                  </td>
                  <td style={{ color: 'var(--dim)' }}>{when(k.lastUsedAt)}</td>
                  <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                  <td className="n">
                    {k.status !== 'revoked' && (
                      <button className="btn btn-ghost" disabled={busy}
                              style={{ fontSize: 12, padding: '5px 11px', color: 'var(--red)' }}
                              onClick={() => revoke(k)}>
                        Thu hồi
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
