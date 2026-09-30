'use client';

import { useState } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  async function submit() {
    if (next !== confirm) { setError('Hai lần nhập mật khẩu mới không khớp'); return; }
    setBusy(true); setError(''); setOk(false);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, next }),
    });
    setBusy(false);
    if (res.ok) {
      setOk(true);
      setCurrent(''); setNext(''); setConfirm('');
    } else setError((await res.json().catch(() => ({}))).error ?? 'Không đổi được mật khẩu');
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <b>Đổi mật khẩu của bạn</b>
        <span>tối thiểu 12 ký tự</span>
      </div>
      <div style={{ padding: '16px 18px', maxWidth: 460 }}>
        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}
        {ok && (
          <div style={{
            background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5,
            padding: '10px 12px', borderRadius: 'var(--r-sm)', marginBottom: 12,
          }}>Đã đổi mật khẩu.</div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Mật khẩu hiện tại</div>
            <input style={inputStyle} type="password" value={current} autoComplete="current-password"
                   onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Mật khẩu mới</div>
            <input style={inputStyle} type="password" value={next} autoComplete="new-password"
                   onChange={(e) => setNext(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Nhập lại mật khẩu mới</div>
            <input style={inputStyle} type="password" value={confirm} autoComplete="new-password"
                   onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div>
            <button className="btn" onClick={submit}
                    disabled={busy || !current || next.length < 12}>
              {busy ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </button>
          </div>
        </div>

        <div className="note" style={{ maxWidth: 'none', marginTop: 12 }}>
          Phải nhập mật khẩu hiện tại. Không có bước này thì ai mượn được máy đang
          mở sẵn phiên là chiếm luôn tài khoản.
        </div>
      </div>
    </div>
  );
}
