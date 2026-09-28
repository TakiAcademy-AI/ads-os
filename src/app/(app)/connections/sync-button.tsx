'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SyncButton({ accountId, label = 'Đồng bộ ngay' }: { accountId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run() {
    setBusy(true); setMsg('');
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adAccountId: accountId }),
    });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`${b.campaigns} chiến dịch · ${b.metricRows} dòng số liệu · ` +
             `${b.revisionRows} revision mới · ${Math.round(b.durationMs / 100) / 10}s`);
      router.refresh();
    } else {
      setMsg(b.error ?? 'Đồng bộ thất bại');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
      {msg && <span className="note" style={{ margin: 0, maxWidth: 380, textAlign: 'right' }}>{msg}</span>}
      <button className="btn" onClick={run} disabled={busy}>
        {busy ? 'Đang kéo số…' : label}
      </button>
    </div>
  );
}
