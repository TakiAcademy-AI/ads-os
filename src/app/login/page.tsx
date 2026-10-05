'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LegalLinks } from '../_legal/shell';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.replace('/');
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Đăng nhập thất bại');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <div className="brand-logo">A</div>
          <b>Ads OS</b>
        </div>
        <h1>Đăng nhập</h1>
        <p>Vận hành quảng cáo Facebook, Google, TikTok</p>

        {error && <div className="err">{error}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} required
          />
        </div>

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
          {busy ? 'Đang kiểm tra…' : 'Đăng nhập'}
        </button>

        <LegalLinks style={{ justifyContent: 'center', marginTop: 20 }} />
      </form>
    </div>
  );
}
