'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Found {
  externalId: string;
  name: string;
  currency: string;
  timezone?: string;
  active: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

export function ConnectPanel() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState('');

  async function probe() {
    setBusy(true); setError(''); setFound(null);
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setFound(body.accounts ?? []);
    else setError(body.error ?? 'Không kiểm tra được token');
  }

  async function save(a: Found) {
    setSaving(a.externalId); setError('');
    const res = await fetch('/api/connections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.trim(), externalId: a.externalId, name: a.name,
        currency: a.currency, timezone: a.timezone,
      }),
    });
    setSaving('');
    if (res.ok) { setToken(''); setFound(null); router.refresh(); }
    else setError((await res.json().catch(() => ({}))).error ?? 'Không lưu được');
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <b>Kết nối tài khoản Facebook Ads</b>
        <span>token chỉ cần quyền ads_read</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>
          System User access token
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono), monospace', fontSize: 12.5 }}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="EAAG…"
            type="password"
            autoComplete="off"
          />
          <button className="btn" onClick={probe} disabled={busy || token.trim().length < 20}>
            {busy ? 'Đang kiểm tra…' : 'Kiểm tra'}
          </button>
        </div>
        <div className="note" style={{ maxWidth: 'none', marginTop: 8 }}>
          Token được mã hoá trước khi lưu và không bao giờ hiện lại. Dùng token chỉ có
          quyền <span className="mono">ads_read</span> — lúc đó dù có lỗi ở đâu thì
          Facebook cũng từ chối mọi lệnh ghi.
        </div>

        {found && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              {found.length === 0
                ? 'Token hợp lệ nhưng không truy cập được tài khoản quảng cáo nào'
                : `Tìm thấy ${found.length} tài khoản — chọn để kết nối`}
            </div>
            {found.map((a) => (
              <div key={a.externalId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginBottom: 7,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--dim)' }}>
                    {a.externalId} · {a.currency}{a.timezone ? ` · ${a.timezone}` : ''}
                  </div>
                </div>
                {!a.active && <span className="tag tag-hold">không hoạt động</span>}
                <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                        disabled={saving === a.externalId}
                        onClick={() => save(a)}>
                  {saving === a.externalId ? 'Đang lưu…' : 'Kết nối'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
