'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountOption } from '@/lib/account';

export function AccountSwitcher({
  accounts, currentId,
}: {
  accounts: AccountOption[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const current = accounts.find((a) => a.id === currentId);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter(
      (a) => a.name.toLowerCase().includes(needle) || a.externalId.includes(needle),
    );
  }, [accounts, q]);

  async function pick(id: string) {
    if (id === currentId) { setOpen(false); return; }
    setBusy(id);
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: id }),
    });
    setBusy('');
    if (res.ok) { setOpen(false); setQ(''); router.refresh(); }
    else alert((await res.json().catch(() => ({}))).error ?? 'Không đổi được tài khoản');
  }

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--dim)' }}>
        Chưa có tài khoản nào được bật
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', marginBottom: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', padding: '9px 11px', fontFamily: 'inherit',
          background: 'var(--card)', border: '1px solid var(--line)',
          borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--ink)',
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: .5, textTransform: 'uppercase' }}>
          Tài khoản
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {current?.name ?? 'Chọn tài khoản'}
          </span>
          <span style={{ color: 'var(--dim)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--card)', border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r-sm)', boxShadow: '0 8px 24px rgba(20,20,60,.12)',
          maxHeight: 320, overflowY: 'auto',
        }}>
          {accounts.length > 6 && (
            <div style={{ padding: 7, borderBottom: '1px solid var(--line)',
                          position: 'sticky', top: 0, background: 'var(--card)' }}>
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm tài khoản…"
                style={{
                  width: '100%', padding: '6px 9px', fontSize: 12.5, fontFamily: 'inherit',
                  border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
                  background: 'var(--card)', color: 'var(--ink)',
                }}
              />
            </div>
          )}

          {shown.length === 0 && (
            <div style={{ padding: 16, fontSize: 12.5, color: 'var(--dim)', textAlign: 'center' }}>
              Không khớp tài khoản nào
            </div>
          )}

          {shown.map((a) => {
            const on = a.id === currentId;
            return (
              <button
                key={a.id} onClick={() => pick(a.id)} disabled={!!busy}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 0,
                  padding: '8px 11px', fontFamily: 'inherit', cursor: 'pointer',
                  background: on ? 'var(--acc-soft)' : 'transparent',
                  color: on ? 'var(--acc-ink)' : 'var(--ink)',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: on ? 500 : 400 }}>
                  {busy === a.id ? 'Đang đổi…' : a.name}
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 1 }}>
                  {a.externalId} · {a.currency}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
