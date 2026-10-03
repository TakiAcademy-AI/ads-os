'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PageRow {
  pageId: string;
  name: string;
  hasToken: boolean;
  /** Số cấu hình kích hoạt theo bài viết đang lấy bài từ Page này. */
  configs: number;
}

export function PagesCard({ pages }: { pages: PageRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function call(method: 'POST' | 'DELETE', url: string, key: string) {
    setBusy(key); setError('');
    const res = await fetch(url, { method });
    const b = await res.json().catch(() => ({}));
    setBusy('');
    if (res.ok) router.refresh();
    else setError(b.error ?? 'Thao tác thất bại');
  }

  function remove(p: PageRow) {
    const warn = p.configs
      ? `\n\nĐang có ${p.configs} cấu hình lấy bài từ Page này — chúng sẽ dừng cho tới khi chọn Page khác.`
      : '';
    if (confirm(`Gỡ Page "${p.name}" và xoá page token?${warn}`)) {
      call('DELETE', `/api/pages/${encodeURIComponent(p.pageId)}`, p.pageId);
    }
  }

  function removeAll() {
    const used = pages.reduce((n, p) => n + p.configs, 0);
    const warn = used ? `\n\n${used} cấu hình đang lấy bài từ các Page này sẽ dừng.` : '';
    if (confirm(`Gỡ toàn bộ ${pages.length} Page?${warn}`)) call('DELETE', '/api/pages', '*');
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <b>Page đã nạp</b>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pages.length} Page
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={!!busy}
                  onClick={() => call('POST', '/api/pages', 'reload')}>
            {busy === 'reload' ? '…' : 'Nạp lại từ token chính'}
          </button>
          {pages.length > 1 && (
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={!!busy}
                    onClick={removeAll}>
              {busy === '*' ? '…' : 'Gỡ tất cả'}
            </button>
          )}
        </span>
      </div>
      {error && <div className="err" style={{ margin: '12px 18px 0' }}>{error}</div>}
      {pages.length === 0 ? (
        <div className="empty">Chưa có Page nào.</div>
      ) : (
        <table>
          <tbody>
            {pages.map((p) => (
              <tr key={p.pageId}>
                <td>
                  <div className="cell-title">{p.name}</div>
                  <div className="cell-sub mono">{p.pageId}</div>
                </td>
                <td>
                  <span className={`tag ${p.hasToken ? 'tag-ok' : 'tag-over'}`}>
                    {p.hasToken ? 'có page token' : 'thiếu token'}
                  </span>
                </td>
                <td style={{ color: 'var(--dim)' }}>
                  {p.configs ? `${p.configs} cấu hình đang dùng` : '—'}
                </td>
                <td className="n">
                  <button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={!!busy}
                          onClick={() => remove(p)}>
                    {busy === p.pageId ? '…' : 'Gỡ'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="note" style={{ maxWidth: 'none', margin: '10px 18px 14px' }}>
        Mỗi lần dán token hoặc đăng nhập Facebook, Page mới được <b>cộng thêm</b> chứ không thay
        danh sách cũ — Page không dùng nữa thì gỡ ở đây. Ngắt tài khoản Facebook cuối cùng
        còn token cũng gỡ hết Page.
      </div>
    </div>
  );
}
