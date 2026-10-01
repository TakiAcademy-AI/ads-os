'use client';

import { useEffect, useRef, useState } from 'react';
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

export function ConnectPanel({ oauthReady, googleReady, googleDevToken }: {
  oauthReady: boolean;
  googleReady: boolean;
  /** Đã có GOOGLE_ADS_DEVELOPER_TOKEN chưa — thiếu thì Google Ads API từ chối mọi lời gọi. */
  googleDevToken: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'oauth' | 'google' | 'token'>(oauthReady ? 'oauth' : 'token');
  const [token, setToken] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState('');
  const popup = useRef<Window | null>(null);

  // Popup báo kết quả về bằng postMessage. Chỉ nhận message cùng origin —
  // không thì bất kỳ trang nào cũng giả được kết quả "kết nối thành công".
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as {
        ok?: boolean; accounts?: number; error?: string; pages?: number; managers?: number;
      };
      if (typeof d?.ok !== 'boolean') return;
      setBusy(false);
      if (d.ok) {
        setInfo(
          `Đã lấy được ${d.accounts} tài khoản. Chọn tài khoản muốn dùng ở bảng dưới.`
          + (d.pages ? ` Kèm ${d.pages} Page.` : '')
          // MCC không chạy quảng cáo trực tiếp nên bị bỏ qua — nói ra để người
          // dùng không thắc mắc vì sao thiếu mất vài tài khoản.
          + (d.managers ? ` Bỏ qua ${d.managers} tài khoản quản lý (MCC).` : ''),
        );
        setError('');
        router.refresh();
      } else {
        setError(d.error ?? 'Kết nối thất bại');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router]);

  function startOauth(platform: 'facebook' | 'google' = 'facebook') {
    setBusy(true); setError(''); setInfo('');
    const w = 620, h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    popup.current = window.open(
      `/api/connections/${platform}/start`, `${platform}-oauth`,
      `width=${w},height=${h},left=${left},top=${top}`,
    );
    if (!popup.current) {
      setBusy(false);
      setError('Trình duyệt chặn popup. Cho phép popup cho trang này rồi thử lại.');
      return;
    }
    // Người dùng đóng popup giữa chừng thì không có postMessage nào tới.
    const timer = setInterval(() => {
      if (popup.current?.closed) { clearInterval(timer); setBusy(false); }
    }, 700);
  }

  async function probe() {
    setBusy(true); setError(''); setFound(null); setInfo('');
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
        <b>Thêm kết nối</b>
        <span>đọc số liệu + tắt/sửa ads (mặc định không dùng)</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}
        {info && (
          <div style={{
            background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5,
            padding: '10px 12px', borderRadius: 'var(--r-sm)', marginBottom: 12,
          }}>{info}</div>
        )}

        <div style={{ display: 'flex', gap: 4, background: 'var(--side)', padding: 4,
                      borderRadius: 'var(--r-sm)', marginBottom: 16, width: 'fit-content' }}>
          {/* Tab CHƯA cấu hình vẫn bấm được — hướng dẫn cách cấu hình nằm bên
              trong tab đó. Khoá tab lại là giấu lời giải sau đúng cánh cửa mà
              nó dạy cách mở. */}
          {([
            ['oauth', 'Facebook', oauthReady],
            ['google', 'Google Ads', googleReady],
            ['token', 'Dán token thủ công', true],
          ] as const).map(([m, label, ready]) => (
            <button key={m} onClick={() => setMode(m)}
                    style={{
                      padding: '7px 15px', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                      border: 0, borderRadius: 6, cursor: 'pointer',
                      background: mode === m ? 'var(--card)' : 'transparent',
                      color: mode === m ? 'var(--ink)' : 'var(--dim)',
                    }}>
              {label}
              {!ready && (
                <span style={{ fontSize: 9, marginLeft: 5, letterSpacing: .3 }}>CHƯA CẤU HÌNH</span>
              )}
            </button>
          ))}
        </div>

        {mode === 'oauth' && (
          <>
            {!oauthReady ? (
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                Chưa cấu hình app Facebook. Thêm <span className="mono">FB_APP_ID</span> và{' '}
                <span className="mono">FB_APP_SECRET</span> vào <span className="mono">.env</span>,
                và khai báo redirect URI{' '}
                <span className="mono">{typeof window !== 'undefined' ? window.location.origin : ''}/api/connections/facebook/callback</span>{' '}
                trong phần Facebook Login của app.
              </div>
            ) : (
              <>
                <button className="btn" onClick={() => startOauth('facebook')} disabled={busy}
                        style={{ background: '#1877F2', fontSize: 14, padding: '11px 20px' }}>
                  {busy ? 'Đang chờ cửa sổ Facebook…' : 'Đăng nhập bằng Facebook'}
                </button>
                <div className="note" style={{ maxWidth: 'none', marginTop: 10 }}>
                  Popup sẽ hiện lên để bạn chọn tài khoản và duyệt quyền. Ads OS xin{' '}
                  <span className="mono">ads_read</span>, <span className="mono">ads_management</span>,{' '}
                  <span className="mono">business_management</span>,{' '}
                  <span className="mono">pages_show_list</span>,{' '}
                  <span className="mono">pages_read_engagement</span>,{' '}
                  <span className="mono">pages_manage_ads</span> — tức là có quyền
                  tắt chiến dịch và đổi ngân sách. <b>Nhưng mặc định mọi cấu hình chạy ở
                  chế độ thử và không đụng vào tài khoản của bạn</b>; chỉ khi bạn tự tay
                  bật &ldquo;ghi thật&rdquo; trên từng cấu hình thì bot mới được hành động, và vẫn
                  bị chặn bởi trần thiệt hại cùng danh sách chiến dịch được bảo vệ.
                  Token nhận về có hạn 60 ngày, hết hạn thì nối lại.
                </div>
              </>
            )}
          </>
        )}

        {mode === 'google' && (
          <>
            {!googleReady ? (
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                Chưa cấu hình app Google. Thêm <span className="mono">GOOGLE_ADS_CLIENT_ID</span>,{' '}
                <span className="mono">GOOGLE_ADS_CLIENT_SECRET</span> và{' '}
                <span className="mono">GOOGLE_ADS_DEVELOPER_TOKEN</span> vào{' '}
                <span className="mono">.env</span>, và khai redirect URI{' '}
                <span className="mono">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/api/connections/google/callback
                </span>{' '}
                trong Google Cloud Console.
              </div>
            ) : (
              <>
                {!googleDevToken && (
                  <div className="err" style={{ marginBottom: 12 }}>
                    Thiếu <span className="mono">GOOGLE_ADS_DEVELOPER_TOKEN</span>. Đăng nhập
                    vẫn chạy nhưng Google Ads API sẽ từ chối mọi lời gọi sau đó.
                  </div>
                )}
                <button className="btn" onClick={() => startOauth('google')} disabled={busy}
                        style={{ background: '#1A73E8', fontSize: 14, padding: '11px 20px' }}>
                  {busy ? 'Đang chờ cửa sổ Google…' : 'Đăng nhập bằng Google'}
                </button>
                <div className="note" style={{ maxWidth: 'none', marginTop: 10 }}>
                  Ads OS xin đúng một quyền:{' '}
                  <span className="mono">https://www.googleapis.com/auth/adwords</span>.
                  <br /><br />
                  <b>Khác Facebook ở hai điểm.</b> Kết nối Google <b>không hết hạn sau 60
                  ngày</b> — Google cấp refresh token sống vĩnh viễn, chỉ mất khi bạn tự
                  thu hồi quyền. Và tài khoản <b>quản lý (MCC) sẽ bị bỏ qua</b>: chúng
                  không chạy quảng cáo trực tiếp nên đồng bộ về cũng không có số liệu.
                </div>
              </>
            )}
          </>
        )}

        {mode === 'token' && (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>
              System User access token
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <input
                style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono), monospace', fontSize: 12.5 }}
                value={token} onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG…" type="password" autoComplete="off"
              />
              <button className="btn" onClick={probe} disabled={busy || token.trim().length < 20}>
                {busy ? 'Đang kiểm tra…' : 'Kiểm tra'}
              </button>
            </div>
            <div className="note" style={{ maxWidth: 'none', marginTop: 8 }}>
              System User token <b>không hết hạn</b> — hợp cho chạy nền dài hạn, nhưng phải tự
              tạo trong Business Settings. Token mã hoá trước khi lưu và không hiện lại.
            </div>

            {found && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  {found.length === 0
                    ? 'Token hợp lệ nhưng không truy cập được tài khoản quảng cáo nào'
                    : `Tìm thấy ${found.length} tài khoản`}
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
                            disabled={saving === a.externalId} onClick={() => save(a)}>
                      {saving === a.externalId ? 'Đang lưu…' : 'Kết nối'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
