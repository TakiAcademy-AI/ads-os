'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdTemplate } from '@/lib/queries/templates';

interface Post {
  id: string;
  message: string;
  createdTime: string;
  permalink: string | null;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: hint ? 2 : 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

export function QuickAd({
  accounts, pages, templates, defaultAccountId,
}: {
  accounts: { id: string; name: string; currency: string }[];
  pages: { pageId: string; name: string; hasToken: boolean }[];
  templates: AdTemplate[];
  defaultAccountId: string | null;
}) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [pageId, setPageId] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [postId, setPostId] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [busy, setBusy] = useState<'validate' | 'create' | null>(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [created, setCreated] = useState<{ campaignId: string; adId: string } | null>(null);

  const post = useMemo(() => posts.find((p) => p.id === postId), [posts, postId]);
  const template = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);

  useEffect(() => {
    if (!pageId) { setPosts([]); setPostId(''); return; }
    setLoadingPosts(true);
    setError('');
    setPostId('');
    fetch(`/api/pages/${pageId}/posts`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? 'Không đọc được bài viết');
        setPosts(d.posts ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingPosts(false));
  }, [pageId]);

  // Tên chiến dịch gợi ý từ nội dung bài — nhưng thôi tự động ngay khi người
  // dùng gõ tay, không thì mỗi lần đổi bài lại xoá mất chữ họ vừa nhập.
  useEffect(() => {
    if (nameTouched || !post) return;
    const excerpt = post.message.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Bài không có chữ';
    setName(`${excerpt} — ${post.createdTime.slice(0, 10)}`.slice(0, 100));
  }, [post, nameTouched]);

  const ready = !!(accountId && pageId && postId && templateId && name.trim());

  async function send(validateOnly: boolean) {
    setBusy(validateOnly ? 'validate' : 'create');
    setError('');
    setOkMsg('');
    const res = await fetch('/api/ads/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adAccountId: accountId, pageId, postId, campaignName: name.trim(),
        templateId, validateOnly,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(d.error ?? 'Thất bại'); return; }

    if (validateOnly) {
      setOkMsg('Kiểm tra qua — tài khoản nhận được chiến dịch kiểu này. '
        + 'Chưa có gì được tạo ra.');
    } else {
      setCreated({ campaignId: d.campaignId, adId: d.adId });
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="card"><div className="empty">
        <div style={{ marginBottom: 12 }}>Chưa có tài khoản quảng cáo nào đang bật.</div>
        <Link href="/connections" className="btn">Kết nối tài khoản Facebook</Link>
      </div></div>
    );
  }
  if (templates.length === 0) {
    return (
      <div className="card"><div className="empty">
        <div style={{ marginBottom: 12 }}>
          Chưa có mẫu quảng cáo nào. Mẫu giữ phần nhắm đối tượng và ngân sách —
          cần ít nhất một mẫu trước khi đăng.
        </div>
        <Link href="/mau-quang-cao" className="btn">Tạo mẫu quảng cáo</Link>
      </div></div>
    );
  }

  if (created) {
    return (
      <div className="card">
        <div className="card-head"><b>Đã tạo xong</b></div>
        <div style={{ padding: '18px 20px' }}>
          <div style={{
            background: 'var(--grn-soft)', color: 'var(--grn)', padding: '13px 15px',
            borderRadius: 'var(--r-sm)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 14,
          }}>
            <b>Chiến dịch đã tạo và đang TẠM DỪNG — chưa tiêu đồng nào.</b>
            <br />Vào Trình quản lý quảng cáo của Facebook kiểm tra lại rồi tự bật khi
            bạn thấy ổn.
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.9 }}>
            chiến dịch {created.campaignId}<br />quảng cáo {created.adId}
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <button className="btn" onClick={() => { setCreated(null); setPostId(''); setNameTouched(false); }}>
              Đăng bài khác
            </button>
            <Link href="/log" className="btn btn-ghost">Xem nhật ký</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}
         className="split">
      <div className="card">
        <div className="card-head"><b>Chọn bài và đích đến</b></div>
        <div style={{ padding: '16px 20px' }}>
          {error && <div className="err" style={{ marginBottom: 14 }}>{error}</div>}
          {okMsg && (
            <div style={{
              background: 'var(--grn-soft)', color: 'var(--grn)', fontSize: 12.5,
              padding: '10px 13px', borderRadius: 'var(--r-sm)', marginBottom: 14, lineHeight: 1.5,
            }}>{okMsg}</div>
          )}

          <Field label="Tài khoản quảng cáo">
            <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </Field>

          <Field label="Page">
            <select style={inputStyle} value={pageId} onChange={(e) => setPageId(e.target.value)}>
              <option value="">— Chọn Page —</option>
              {pages.map((p) => (
                <option key={p.pageId} value={p.pageId} disabled={!p.hasToken}>
                  {p.name}{p.hasToken ? '' : ' (thiếu token)'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Bài viết cần đẩy"
                 hint="Quảng cáo trỏ thẳng vào bài có sẵn, không tạo nội dung mới.">
            {!pageId ? (
              <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Chọn Page trước.</div>
            ) : loadingPosts ? (
              <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Đang tải bài viết…</div>
            ) : posts.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Page này chưa có bài nào đọc được.</div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)',
                            borderRadius: 'var(--r-sm)' }}>
                {posts.map((p) => {
                  const on = p.id === postId;
                  return (
                    <button key={p.id} type="button"
                            onClick={() => { setPostId(p.id); setNameTouched(false); }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '10px 12px', border: 0, cursor: 'pointer',
                              borderBottom: '1px solid var(--line)', fontFamily: 'inherit',
                              background: on ? 'var(--acc-soft)' : 'transparent',
                              color: on ? 'var(--acc-ink)' : 'var(--ink-2)',
                            }}>
                      <div style={{ fontSize: 13, lineHeight: 1.45, fontWeight: on ? 500 : 400 }}>
                        {p.message.replace(/\s+/g, ' ').trim().slice(0, 95) || '(bài không có chữ)'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 3 }}>
                        {new Date(p.createdTime).toLocaleString('vi-VN')}
                        {p.permalink?.includes('/reel/') && ' · Reel'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label="Mẫu quảng cáo"
                 hint="Nhắm đối tượng và ngân sách lấy từ mẫu. Sửa mẫu ở tab Mẫu quảng cáo.">
            <select style={inputStyle} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          <Field label="Tên chiến dịch">
            <input style={inputStyle} value={name}
                   onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
          </Field>
        </div>
      </div>

      <div className="card" style={{ position: 'sticky', top: 16 }}>
        <div className="card-head"><b>Sẽ tạo ra</b></div>
        <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.85 }}>
          <div>Mục tiêu <b>Tương tác bài viết</b></div>
          {template && (
            <>
              <div>Ngân sách <b>{Math.round(template.dailyBudgetMicros / 1_000_000).toLocaleString('vi-VN')}đ/ngày</b></div>
              <div>Tuổi <b>{template.ageMin}–{template.ageMax}</b></div>
              <div>Quốc gia <b>{template.countries.join(', ')}</b></div>
            </>
          )}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Trạng thái <span className="tag tag-hold">TẠM DỪNG</span>
          </div>

          <div className="note" style={{ maxWidth: 'none', marginTop: 12 }}>
            Chiến dịch tạo ra <b>luôn tạm dừng</b>. Bạn phải tự bật trong Trình quản
            lý quảng cáo thì nó mới tiêu tiền.
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <button className="btn btn-ghost" disabled={!ready || busy !== null}
                    onClick={() => send(true)}>
              {busy === 'validate' ? 'Đang kiểm…' : 'Kiểm tra trước'}
            </button>
            <button className="btn" disabled={!ready || busy !== null}
                    onClick={() => send(false)}>
              {busy === 'create' ? 'Đang tạo…' : 'Tạo chiến dịch (tạm dừng)'}
            </button>
          </div>

          <div className="note" style={{ maxWidth: 'none', marginTop: 10 }}>
            <b>Kiểm tra trước</b> gửi cấu hình cho Facebook duyệt mà <b>không tạo gì</b>.
            Bắt được các lỗi thuộc về tài khoản — chưa gắn thẻ, bị khoá quyền tạo
            quảng cáo. Không bảo chứng được cả chuỗi, vì hai bước sau cần chiến dịch
            thật mới kiểm được.
          </div>
        </div>
      </div>
    </div>
  );
}
