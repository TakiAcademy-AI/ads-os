'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TT_OBJECTIVES, TT_AGES, TT_CTAS, checkTtSpec, minDailyBudget, type TtObjective, type TtQuickSpec,
} from '@/lib/ads/tiktok-create-spec';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
  background: 'var(--card)', color: 'var(--ink)',
};

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: hint ? 2 : 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

interface Identity { id: string; type: string; name: string; avatar: string | null; bcId: string | null; usable: boolean }
interface Post { itemId: string; text: string; cover: string | null; durationSec: number | null; status: string }

/** ID vị trí Việt Nam của TikTok — cùng ID với nhóm quảng cáo thật đang chạy trong tài khoản. */
const VIETNAM = { id: '1562822', name: 'Việt Nam' };

export function TikTokQuickAd({ accounts, defaultAccountId }: {
  accounts: { id: string; name: string; currency: string }[];
  defaultAccountId: string | null;
}) {
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId! : accounts[0]?.id ?? '',
  );
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? 'VND';

  const [identities, setIdentities] = useState<Identity[]>([]);
  const [identityId, setIdentityId] = useState('');
  const identity = identities.find((i) => i.id === identityId);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [itemId, setItemId] = useState('');
  const post = posts.find((p) => p.itemId === itemId);
  const [loading, setLoading] = useState<'identities' | 'posts' | null>(null);

  const [objective, setObjective] = useState<TtObjective>('VIDEO_VIEWS');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [budget, setBudget] = useState(String(minDailyBudget(currency) ?? ''));
  const [ages, setAges] = useState<string[]>(TT_AGES.map((a) => a.id));
  const [gender, setGender] = useState<TtQuickSpec['gender']>('GENDER_UNLIMITED');
  const [url, setUrl] = useState('https://');
  const [cta, setCta] = useState('LEARN_MORE');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ campaignId: string; adgroupId: string; adId: string } | null>(null);

  // Đổi tài khoản → tải lại kênh.
  useEffect(() => {
    if (!accountId) return;
    setLoading('identities'); setError(''); setIdentities([]); setIdentityId(''); setPosts([]); setItemId('');
    fetch(`/api/tiktok/identities?account=${accountId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? 'Không đọc được kênh TikTok');
        const list: Identity[] = d.identities ?? [];
        setIdentities(list);
        setIdentityId(list.find((i) => i.usable)?.id ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(null));
  }, [accountId]);

  async function loadPosts(more = false) {
    if (!identity) return;
    setLoading('posts'); setError('');
    const q = new URLSearchParams({ account: accountId, identity: identity.id, type: identity.type });
    if (identity.bcId) q.set('bc', identity.bcId);
    if (more && cursor) q.set('cursor', String(cursor));
    try {
      const r = await fetch(`/api/tiktok/posts?${q}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'Không đọc được bài đăng');
      setPosts((prev) => (more ? [...prev, ...(d.posts ?? [])] : d.posts ?? []));
      setCursor(d.cursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPosts([]); setItemId(''); setCursor(null); if (identity) loadPosts(); }, [identityId]);

  // Tên gợi ý từ nội dung bài — thôi tự động khi người dùng đã gõ tay.
  useEffect(() => {
    if (nameTouched || !post) return;
    const label = TT_OBJECTIVES.find((o) => o.id === objective)?.label ?? objective;
    const excerpt = post.text.replace(/\s+/g, ' ').trim().slice(0, 50) || `Bài ${post.itemId}`;
    setName(`${label} · ${excerpt}`.slice(0, 120));
  }, [post, objective, nameTouched]);

  const urlMode = TT_OBJECTIVES.find((o) => o.id === objective)?.url ?? 'none';
  const link = url.trim() === 'https://' ? '' : url.trim();
  const spec: TtQuickSpec = {
    objective, campaignName: name.trim(), dailyBudget: Number(budget) || 0,
    identity: { id: identity?.id ?? '', type: identity?.type ?? '', bcId: identity?.bcId ?? null },
    itemId, locationIds: [VIETNAM.id], ageGroups: ages, gender,
    // Có link mới gửi nút kêu gọi; mục tiêu theo dõi kênh thì không gửi gì.
    ...(urlMode !== 'none' && (link || urlMode === 'required') ? { landingPageUrl: link, callToAction: cta } : {}),
  };
  const problems = checkTtSpec(spec, currency);

  async function create() {
    const fmt = `${(Number(budget) || 0).toLocaleString('vi-VN')}${currency === 'VND' ? 'đ' : ` ${currency}`}`;
    if (!confirm(`Tạo chiến dịch TikTok "${name.trim()}" — ngân sách ${fmt}/ngày?\n\nChiến dịch được tạo ở trạng thái TẠM DỪNG, chưa tiêu tiền. Bạn tự bật khi đã kiểm tra.`)) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/ads/tiktok-quick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adAccountId: accountId, ...spec }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Không tạo được chiến dịch'); return; }
      setCreated({ campaignId: d.campaignId, adgroupId: d.adgroupId, adId: d.adId });
    } catch {
      setError('Không gửi được yêu cầu. Nếu yêu cầu đã tới máy chủ, chiến dịch có thể đã được tạo — xem Nhật ký thay đổi trước khi bấm lại.');
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="card"><div className="empty">
        <div style={{ marginBottom: 12 }}>Chưa có tài khoản TikTok nào đang bật.</div>
        <Link href="/connections" className="btn">Kết nối TikTok</Link>
      </div></div>
    );
  }

  if (created) {
    return (
      <div className="card">
        <div className="card-head"><b>Đã tạo xong</b></div>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ background: 'var(--grn-soft)', color: 'var(--grn)', padding: '13px 15px',
                        borderRadius: 'var(--r-sm)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
            <b>Chiến dịch đã tạo và đang TẠM DỪNG — chưa tiêu đồng nào.</b>
            <br />Kiểm tra lại trong TikTok Ads Manager (hoặc trang Chiến dịch sau khi đồng bộ) rồi tự bật.
            TikTok còn duyệt quảng cáo trước khi hiển thị.
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.9 }}>
            chiến dịch {created.campaignId}<br />nhóm quảng cáo {created.adgroupId}<br />quảng cáo {created.adId}
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <button className="btn" onClick={() => { setCreated(null); setItemId(''); setNameTouched(false); }}>Đẩy bài khác</button>
            <Link href="/log" className="btn btn-ghost">Xem nhật ký</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }} className="split">
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card">
          <div className="card-head"><b>Chọn bài đăng TikTok</b><span>Spark Ads — đẩy bài có sẵn của kênh</span></div>
          <div style={{ padding: '16px 20px' }}>
            <Field label="Tài khoản quảng cáo">
              <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
            <Field label="Kênh TikTok" hint="Kênh đã liên kết với tài khoản quảng cáo trong TikTok Ads Manager.">
              {loading === 'identities' ? <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Đang tải kênh…</div>
                : identities.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>
                    Tài khoản này chưa liên kết kênh TikTok nào. Vào TikTok Ads Manager → Công cụ → Tài khoản TikTok để liên kết.
                  </div>
                ) : (
                  <select style={inputStyle} value={identityId} onChange={(e) => setIdentityId(e.target.value)}>
                    {identities.map((i) => (
                      <option key={i.id} value={i.id} disabled={!i.usable}>
                        @{i.name}{i.usable ? '' : ' (không dùng được)'}
                      </option>
                    ))}
                  </select>
                )}
            </Field>
            <Field label="Bài đăng">
              {!identity ? <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Chọn kênh trước.</div>
                : posts.length === 0 && loading === 'posts' ? <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Đang tải bài…</div>
                  : posts.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Kênh này chưa có bài đăng nào.</div>
                    : (
                      <>
                        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
                                      maxHeight: 420, overflowY: 'auto', padding: 2 }}>
                          {posts.map((p) => {
                            const on = p.itemId === itemId;
                            return (
                              <button key={p.itemId} type="button" onClick={() => { setItemId(p.itemId); setNameTouched(false); }}
                                      title={p.text}
                                      style={{ padding: 0, border: `2px solid ${on ? 'var(--acc)' : 'var(--line)'}`, borderRadius: 8,
                                               background: 'var(--card)', cursor: 'pointer', overflow: 'hidden', textAlign: 'left',
                                               fontFamily: 'inherit' }}>
                                {p.cover
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={p.cover} alt="" referrerPolicy="no-referrer" style={{ width: '100%', aspectRatio: '9 / 14', objectFit: 'cover', display: 'block' }} />
                                  : <div style={{ aspectRatio: '9 / 14', background: 'var(--side)' }} />}
                                <div style={{ padding: '5px 7px', fontSize: 11, lineHeight: 1.35, color: on ? 'var(--acc-ink)' : 'var(--ink-2)',
                                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>
                                  {p.text || '(không có chữ)'}
                                </div>
                                {p.durationSec && <div style={{ padding: '0 7px 5px', fontSize: 10.5, color: 'var(--dim)' }}>{Math.round(p.durationSec)} giây</div>}
                              </button>
                            );
                          })}
                        </div>
                        {cursor && (
                          <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12 }}
                                  disabled={loading === 'posts'} onClick={() => loadPosts(true)}>
                            {loading === 'posts' ? 'Đang tải…' : 'Tải thêm bài'}
                          </button>
                        )}
                      </>
                    )}
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><b>Mục tiêu và nhắm đối tượng</b></div>
          <div style={{ padding: '16px 20px' }}>
            <Field label="Mục tiêu">
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                {TT_OBJECTIVES.map((o) => {
                  const on = o.id === objective;
                  return (
                    <button key={o.id} type="button" onClick={() => setObjective(o.id)}
                            style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                     fontFamily: 'inherit', border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                                     background: on ? 'var(--acc-soft)' : 'var(--card)', color: 'var(--ink)' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: on ? 'var(--acc-ink)' : undefined }}>{o.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.45 }}>{o.body}</div>
                    </button>
                  );
                })}
              </div>
            </Field>
            {urlMode !== 'none' && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 200px' }}>
                <Field label={urlMode === 'required' ? 'Link đích' : 'Link đích (tuỳ chọn)'}
                       hint={urlMode === 'optional' ? 'Gắn nút kêu gọi dưới video. Bỏ trống thì chỉ đẩy bài.' : undefined}>
                  <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} />
                </Field>
                <Field label="Nút kêu gọi">
                  <select style={inputStyle} value={cta} onChange={(e) => setCta(e.target.value)}>
                    {TT_CTAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Tên chiến dịch">
              <input style={inputStyle} value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
            </Field>
            <Field label={`Ngân sách/ngày (${currency})`}
                   hint={minDailyBudget(currency) ? `Tối thiểu ${minDailyBudget(currency)!.toLocaleString('vi-VN')} ${currency}/ngày — quy định của TikTok cho nhóm quảng cáo.` : undefined}>
              <input style={inputStyle} inputMode="numeric" value={budget}
                     onChange={(e) => setBudget(currency === 'VND' ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label="Vị trí" hint="Hiện chạy toàn Việt Nam.">
              <span className="tag tag-keep">{VIETNAM.name}</span>
            </Field>
            <Field label="Độ tuổi">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {TT_AGES.map((a) => (
                  <label key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={ages.includes(a.id)}
                           onChange={(e) => setAges(e.target.checked ? [...ages, a.id] : ages.filter((x) => x !== a.id))} />
                    {a.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Giới tính">
              <select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value as TtQuickSpec['gender'])}>
                <option value="GENDER_UNLIMITED">Mọi giới tính</option>
                <option value="GENDER_FEMALE">Nữ</option>
                <option value="GENDER_MALE">Nam</option>
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="card" style={{ position: 'sticky', top: 16 }}>
        <div className="card-head"><b>Sẽ tạo ra</b></div>
        <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.85 }}>
          {error && <div className="err" style={{ marginBottom: 10, whiteSpace: 'pre-line' }}>{error}</div>}
          {post?.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover} alt="" referrerPolicy="no-referrer" style={{ width: 90, borderRadius: 6, marginBottom: 8 }} />
          )}
          <div>Kênh <b>{identity ? `@${identity.name}` : '—'}</b></div>
          <div>Mục tiêu <b>{TT_OBJECTIVES.find((o) => o.id === objective)?.label}</b></div>
          <div>Ngân sách <b>{(Number(budget) || 0).toLocaleString('vi-VN')}{currency === 'VND' ? 'đ' : ` ${currency}`}/ngày</b></div>
          <div>Vị trí <b>{VIETNAM.name}</b> · tuổi <b>{ages.length === TT_AGES.length ? '18+' : `${ages.length} nhóm`}</b></div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            Trạng thái <span className="tag tag-hold">TẠM DỪNG</span>
          </div>
          {problems.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--amb)', fontSize: 12, lineHeight: 1.6 }}>
              {problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <button className="btn" style={{ width: '100%', marginTop: 14 }} disabled={problems.length > 0 || busy} onClick={create}>
            {busy ? 'Đang tạo…' : 'Tạo chiến dịch (tạm dừng)'}
          </button>
          <div className="note" style={{ maxWidth: 'none', marginTop: 10 }}>
            TikTok không có chế độ kiểm tra trước như Google. Ads OS tạo lần lượt chiến dịch → nhóm
            quảng cáo → quảng cáo, đều ở trạng thái tạm dừng; hỏng giữa chừng thì tự xoá phần vừa tạo.
          </div>
        </div>
      </div>
    </div>
  );
}
