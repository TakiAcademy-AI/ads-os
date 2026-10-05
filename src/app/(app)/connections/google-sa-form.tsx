'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Kết nối Google Ads bằng khoá service account — đường thay thế khi popup đăng
 * nhập Google bị chặn (passkey, tài khoản bị đánh giá rủi ro…).
 */
export function GoogleServiceAccountForm() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [email, setEmail] = useState('');

  // client_email không phải bí mật — đọc ngay từ JSON đang dán để người dùng
  // biết chính xác email nào cần thêm vào Google Ads trước khi bấm Kết nối.
  function onChange(v: string) {
    setKey(v);
    try {
      const e = (JSON.parse(v) as { client_email?: unknown }).client_email;
      setEmail(typeof e === 'string' ? e : '');
    } catch {
      setEmail('');
    }
  }

  async function connect() {
    setBusy(true); setError(''); setInfo('');
    const res = await fetch('/api/connections/google/service-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? 'Kết nối thất bại'); return; }
    setKey(''); setEmail('');
    setInfo(
      `Đã lấy được ${d.accounts} tài khoản qua ${d.email}. Chọn tài khoản muốn dùng ở bảng dưới.`
      + (d.managers ? ` Bỏ qua ${d.managers} tài khoản quản lý (MCC).` : ''),
    );
    router.refresh();
  }

  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
        Kết nối bằng service account <span className="tag tag-keep" style={{ fontSize: 10 }}>không cần đăng nhập Google</span>
      </div>
      <ol className="note" style={{ maxWidth: 'none', margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.8 }}>
        <li>
          Google Cloud Console → <b>IAM &amp; Admin → Service Accounts</b> → <b>Create service
          account</b> (không cần gán vai trò). Dùng <b>project đã bật Google Ads API</b> — cấp
          truy cập API (Test/Basic) tính theo project này.
        </li>
        <li>Mở service account vừa tạo → <b>Keys → Add key → Create new key → JSON</b>. File .json tải về.</li>
        <li>
          Google Ads → <b>Quản trị → Quyền truy cập và bảo mật → +</b> → nhập email service
          account, chọn quyền <b>Tiêu chuẩn</b>. Dùng MCC thì thêm vào MCC để thấy hết tài khoản con.
        </li>
        <li>Mở file .json bằng trình soạn thảo, chép toàn bộ nội dung dán vào ô dưới.</li>
      </ol>

      {error && <div className="err" style={{ marginBottom: 10 }}>{error}</div>}
      {info && (
        <div style={{
          background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5,
          padding: '10px 12px', borderRadius: 'var(--r-sm)', marginBottom: 10,
        }}>{info}</div>
      )}

      <textarea
        value={key} onChange={(e) => onChange(e.target.value)}
        placeholder='{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }'
        spellCheck={false} autoComplete="off" rows={5}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 12, fontFamily: 'var(--font-mono), monospace',
          border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
          background: 'var(--card)', color: 'var(--ink)', resize: 'vertical',
        }}
      />
      {email && (
        <div className="note" style={{ maxWidth: 'none', margin: '6px 0 0' }}>
          Email cần thêm vào Google Ads: <span className="mono">{email}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <button className="btn" onClick={connect} disabled={busy || key.trim().length < 50}>
          {busy ? 'Đang kiểm tra…' : 'Kết nối'}
        </button>
        <span className="note" style={{ margin: 0 }}>
          Khoá được mã hoá trước khi lưu, không hiện lại. Bấm Ngắt ở tài khoản là xoá khoá.
        </span>
      </div>
    </div>
  );
}
