'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AccountActions({ id, pending = false }: { id: string; pending?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function call(method: 'PATCH' | 'DELETE', status?: string) {
    setBusy(method);
    const res = await fetch(`/api/connections/${id}`, {
      method,
      ...(status ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) } : {}),
    });
    setBusy('');
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error ?? 'Thao tác thất bại');
  }

  if (pending) {
    return (
      <button className="btn" style={{ fontSize: 12.5 }} disabled={!!busy}
              onClick={() => call('PATCH', 'active')}>
        {busy ? '…' : 'Dùng tài khoản này'}
      </button>
    );
  }

  return (
    <button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={!!busy}
            onClick={() => {
              if (confirm('Ngắt kết nối và xoá token? Số liệu đã kéo về vẫn giữ nguyên.'
                + ' Mọi cấu hình tự động của tài khoản này (đồng bộ, tắt ads theo CPA…) sẽ NGỪNG chạy cho tới khi kết nối lại.'
                + ' Nếu đây là tài khoản Facebook cuối cùng còn token, các Page đã nạp cũng bị gỡ.')) {
                call('DELETE');
              }
            }}>
      {busy ? '…' : 'Ngắt'}
    </button>
  );
}
