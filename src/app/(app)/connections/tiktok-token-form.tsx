'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', fontSize: 12.5, fontFamily: 'var(--font-mono), monospace',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)', background: 'var(--card)', color: 'var(--ink)',
};

/** Dán access token TikTok — token chính, đăng nhập TikTok về sau không ghi đè. */
export function TikTokTokenForm({ needIds }: { needIds: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [ids, setIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function save() {
    setBusy(true); setError(''); setInfo('');
    const advertiserIds = ids.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/connections/tiktok/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), ...(advertiserIds.length ? { advertiserIds } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Không lưu được'); return; }
      setToken(''); setIds('');
      setInfo(`Đã lưu token cho ${d.saved} tài khoản. Chọn tài khoản muốn dùng ở bảng dưới.`);
      router.refresh();
    } catch {
      setError('Không gửi được yêu cầu — kiểm tra kết nối mạng.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Dán access token TikTok</div>
      {error && <div className="err" style={{ marginBottom: 10 }}>{error}</div>}
      {info && (
        <div style={{ background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5, padding: '10px 12px',
                      borderRadius: 'var(--r-sm)', marginBottom: 10 }}>{info}</div>
      )}
      <input style={inputStyle} type="password" autoComplete="off" value={token}
             onChange={(e) => setToken(e.target.value)} placeholder="Access token TikTok for Business" />
      <input style={{ ...inputStyle, marginTop: 8 }} value={ids} onChange={(e) => setIds(e.target.value)}
             placeholder={needIds ? 'ID tài khoản quảng cáo (advertiser ID), cách nhau bằng dấu phẩy — bắt buộc'
               : 'ID tài khoản quảng cáo (tuỳ chọn — bỏ trống để tự tìm mọi tài khoản token có quyền)'} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
        <button className="btn" onClick={save}
                disabled={busy || token.trim().length < 20 || (needIds && !ids.trim())}>
          {busy ? 'Đang kiểm tra…' : 'Lưu token'}
        </button>
        <span className="note" style={{ margin: 0 }}>
          Token dán tay là <b>token chính</b>: đăng nhập TikTok về sau không ghi đè. Mã hoá trước khi lưu.
          Advertiser ID xem ở góc trên TikTok Ads Manager.
        </span>
      </div>
    </div>
  );
}
