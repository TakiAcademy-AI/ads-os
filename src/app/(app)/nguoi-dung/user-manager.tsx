'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

const ROLE: Record<string, { cls: string; label: string; desc: string }> = {
  admin: { cls: 'tag-over', label: 'Quản trị', desc: 'Mọi thao tác + quản lý người dùng' },
  member: { cls: 'tag-ok', label: 'Thành viên', desc: 'Mọi thao tác, trừ quản lý người dùng' },
  viewer: { cls: 'tag-mute', label: 'Chỉ xem', desc: 'Chỉ đọc — mọi thao tác ghi bị từ chối' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

function when(iso: string | null): string {
  if (!iso) return 'chưa bao giờ';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Mật khẩu ngẫu nhiên đủ mạnh, sinh trong trình duyệt bằng crypto thật. */
function suggestPassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function UserManager({ users, meId }: { users: UserRow[]; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    email: '', name: '', role: 'member' as UserRow['role'], password: '',
  });
  const [freshPw, setFreshPw] = useState<{ email: string; password: string } | null>(null);

  async function send(url: string, method: string, body?: object, key = 'x') {
    setBusy(key);
    setError('');
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (res.ok) { router.refresh(); return true; }
    setError((await res.json().catch(() => ({}))).error ?? 'Thao tác thất bại');
    return false;
  }

  async function create() {
    const pw = draft.password || suggestPassword();
    const ok = await send('/api/users', 'POST', { ...draft, password: pw }, 'new');
    if (ok) {
      // Mật khẩu chỉ hiện MỘT LẦN ở đây — hệ thống chỉ lưu bản băm bcrypt.
      setFreshPw({ email: draft.email, password: pw });
      setDraft({ email: '', name: '', role: 'member', password: '' });
      setAdding(false);
    }
  }

  async function resetPassword(u: UserRow) {
    const pw = suggestPassword();
    if (!window.confirm(
      `Đặt lại mật khẩu cho "${u.name}"?\n\n`
      + `Mật khẩu cũ mất hiệu lực ngay. Mật khẩu mới chỉ hiện một lần.`,
    )) return;
    const ok = await send(`/api/users/${u.id}`, 'PATCH', { password: pw }, u.id);
    if (ok) setFreshPw({ email: u.email, password: pw });
  }

  return (
    <>
      {freshPw && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--grn)' }}>
          <div className="card-head"><b>Mật khẩu mới — chép ngay</b></div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 9 }}>
              Cho <b>{freshPw.email}</b>. Hệ thống chỉ lưu bản băm — đóng đi là không
              xem lại được.
            </div>
            <pre className="mono" style={{
              background: 'var(--side)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)', padding: '11px 14px', fontSize: 15,
              margin: '0 0 10px', letterSpacing: .5,
            }}>{freshPw.password}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ fontSize: 12.5 }}
                      onClick={() => void navigator.clipboard.writeText(freshPw.password)}>
                Chép mật khẩu
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                      onClick={() => setFreshPw(null)}>
                Tôi đã lưu rồi
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <b>Người dùng</b>
          <button className="btn" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Đóng' : '+ Thêm người dùng'}
          </button>
        </div>

        {error && <div className="err" style={{ margin: '14px 18px 0' }}>{error}</div>}

        {adding && (
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)',
                        background: 'var(--side)', display: 'grid', gap: 11 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Email</div>
                <input style={inputStyle} type="email" value={draft.email} autoFocus
                       onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>Tên hiển thị</div>
                <input style={inputStyle} value={draft.name}
                       onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 6 }}>Vai trò</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(['viewer', 'member', 'admin'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setDraft({ ...draft, role: r })}
                          className={draft.role === r ? 'btn' : 'btn btn-ghost'}
                          style={{ fontSize: 12.5 }}>
                    {ROLE[r]!.label}
                  </button>
                ))}
              </div>
              <div className="note" style={{ maxWidth: 'none', marginTop: 6 }}>
                {ROLE[draft.role]!.desc}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>
                Mật khẩu — để trống thì hệ thống tự sinh
              </div>
              <input style={inputStyle} value={draft.password} placeholder="tối thiểu 12 ký tự"
                     onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
            </div>

            <div>
              <button className="btn" onClick={create}
                      disabled={busy !== null || !draft.email.trim() || !draft.name.trim()}>
                {busy === 'new' ? 'Đang tạo…' : 'Tạo tài khoản'}
              </button>
            </div>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Vai trò</th>
              <th>Đăng nhập lần cuối</th>
              <th>Trạng thái</th>
              <th className="n">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const r = ROLE[u.role] ?? ROLE.viewer!;
              const isMe = u.id === meId;
              return (
                <tr key={u.id} style={{ opacity: u.disabled ? .55 : 1 }}>
                  <td>
                    <div className="cell-title">
                      {u.name}{isMe && <span style={{ color: 'var(--dim)', fontWeight: 400 }}> — bạn</span>}
                    </div>
                    <div className="cell-sub mono">{u.email}</div>
                  </td>
                  <td>
                    <select value={u.role} disabled={busy !== null}
                            onChange={(e) => send(`/api/users/${u.id}`, 'PATCH',
                                                  { role: e.target.value }, u.id)}
                            style={{ ...inputStyle, width: 'auto', padding: '5px 9px', fontSize: 12.5 }}>
                      <option value="viewer">Chỉ xem</option>
                      <option value="member">Thành viên</option>
                      <option value="admin">Quản trị</option>
                    </select>
                  </td>
                  <td style={{ color: 'var(--dim)', fontSize: 12.5 }}>{when(u.lastLoginAt)}</td>
                  <td>
                    <span className={`tag ${u.disabled ? 'tag-mute' : r.cls}`}>
                      {u.disabled ? 'Đã khoá' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="n">
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" disabled={busy !== null}
                              style={{ fontSize: 12, padding: '5px 10px' }}
                              onClick={() => resetPassword(u)}>
                        Đặt lại mật khẩu
                      </button>
                      {!isMe && (
                        <button className="btn btn-ghost" disabled={busy !== null}
                                style={{ fontSize: 12, padding: '5px 10px',
                                         color: u.disabled ? 'var(--grn)' : 'var(--red)' }}
                                onClick={() => send(`/api/users/${u.id}`, 'PATCH',
                                                    { disabled: !u.disabled }, u.id)}>
                          {u.disabled ? 'Mở khoá' : 'Khoá'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
